import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://your-project-id.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Database table names
export const TABLES = {
  USERS: 'users',
  SOS_ALERTS: 'sos_alerts',
  SOS_RESPONDERS: 'sos_responders',
  CHAT_ROOMS: 'chat_rooms',
  CHAT_PARTICIPANTS: 'chat_participants',
  MESSAGES: 'messages',
  FEED_POSTS: 'feed_posts',
  SAFE_ZONES: 'safe_zones',
  NOTIFICATIONS: 'notifications',
  LOCATION_UPDATES: 'location_updates',
  EMERGENCY_CONTACTS: 'emergency_contacts',
  EMERGENCY_SERVICES: 'emergency_services',
} as const;

// Helper function to check if Supabase is properly configured
export const isSupabaseConfigured = () => {
  return supabaseUrl !== 'https://your-project-id.supabase.co' && 
         supabaseAnonKey !== 'your-anon-key';
};

// Demo mode fallback for when Supabase is not configured
export const isDemoMode = () => !isSupabaseConfigured();