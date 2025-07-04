import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export class LocationService {
  private static watchId: Location.LocationSubscription | null = null;
  private static lastKnownLocation: Location.LocationObject | null = null;

  static async initialize() {
    try {
      // Request permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission not granted');
      }

      // Request background location permission for emergency monitoring
      if (Platform.OS !== 'web') {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
          console.warn('Background location permission not granted');
        }
      }

      return true;
    } catch (error) {
      console.error('Error initializing location service:', error);
      return false;
    }
  }

  static async getCurrentLocation(): Promise<Location.LocationObject | null> {
    try {
      // Check if location services are enabled
      const isEnabled = await Location.hasServicesEnabledAsync();
      if (!isEnabled) {
        throw new Error('Location services are disabled');
      }

      // For web, return cached location or default
      if (Platform.OS === 'web') {
        const cached = await AsyncStorage.getItem('lastLocation');
        if (cached) {
          return JSON.parse(cached);
        }
        
        // Default to Dhaka, Bangladesh
        return {
          coords: {
            latitude: 23.8103,
            longitude: 90.4125,
            altitude: null,
            accuracy: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        };
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 10000,
      });

      this.lastKnownLocation = location;
      
      // Cache location
      await AsyncStorage.setItem('lastLocation', JSON.stringify(location));
      
      return location;
    } catch (error) {
      console.error('Error getting current location:', error);
      
      // Return last known location if available
      if (this.lastKnownLocation) {
        return this.lastKnownLocation;
      }
      
      return null;
    }
  }

  static async startLocationTracking(userId: string, isEmergency: boolean = false) {
    try {
      if (Platform.OS === 'web') {
        console.log('Location tracking not available on web');
        return;
      }

      // Stop existing tracking
      if (this.watchId) {
        this.watchId.remove();
      }

      const accuracy = isEmergency ? Location.Accuracy.Highest : Location.Accuracy.Balanced;
      const timeInterval = isEmergency ? 5000 : 30000; // 5s for emergency, 30s for normal

      this.watchId = await Location.watchPositionAsync(
        {
          accuracy,
          timeInterval,
          distanceInterval: isEmergency ? 10 : 100, // 10m for emergency, 100m for normal
        },
        (location) => {
          this.handleLocationUpdate(userId, location, isEmergency);
        }
      );

      console.log('Location tracking started');
    } catch (error) {
      console.error('Error starting location tracking:', error);
    }
  }

  static async stopLocationTracking() {
    try {
      if (this.watchId) {
        this.watchId.remove();
        this.watchId = null;
        console.log('Location tracking stopped');
      }
    } catch (error) {
      console.error('Error stopping location tracking:', error);
    }
  }

  private static async handleLocationUpdate(
    userId: string,
    location: Location.LocationObject,
    isEmergency: boolean
  ) {
    try {
      this.lastKnownLocation = location;

      // Update user location in database
      await supabase.from('location_updates').insert({
        user_id: userId,
        location: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          heading: location.coords.heading,
          speed: location.coords.speed,
        },
        timestamp: new Date(location.timestamp).toISOString(),
        is_emergency: isEmergency,
      });

      // Update user's current location
      await supabase
        .from('users')
        .update({
          location: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      // Cache locally
      await AsyncStorage.setItem('lastLocation', JSON.stringify(location));

    } catch (error) {
      console.error('Error handling location update:', error);
    }
  }

  static async reverseGeocode(latitude: number, longitude: number): Promise<string> {
    try {
      const result = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (result.length > 0) {
        const address = result[0];
        return [
          address.name,
          address.street,
          address.city,
          address.region,
          address.country,
        ]
          .filter(Boolean)
          .join(', ');
      }

      return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    } catch (error) {
      console.error('Error reverse geocoding:', error);
      return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }
  }

  static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  static async getNearbyUsers(
    latitude: number,
    longitude: number,
    radius: number = 5000
  ) {
    try {
      const { data, error } = await supabase.rpc('get_nearby_users', {
        lat: latitude,
        lng: longitude,
        radius_meters: radius,
      });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting nearby users:', error);
      return [];
    }
  }

  static async getLocationHistory(userId: string, hours: number = 24) {
    try {
      const since = new Date();
      since.setHours(since.getHours() - hours);

      const { data, error } = await supabase
        .from('location_updates')
        .select('*')
        .eq('user_id', userId)
        .gte('timestamp', since.toISOString())
        .order('timestamp', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting location history:', error);
      return [];
    }
  }

  static async shareLocationWithContact(userId: string, contactId: string, duration: number = 3600) {
    try {
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + duration);

      await supabase.from('location_shares').insert({
        user_id: userId,
        shared_with: contactId,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
      });

      return true;
    } catch (error) {
      console.error('Error sharing location:', error);
      return false;
    }
  }
}