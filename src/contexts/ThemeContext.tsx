import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'

interface ThemeContextType {
  primaryColor: string;
  primaryColorOklch: string;
  loading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function hexToOklch(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const linearR = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  const linearG = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  const linearB = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  const x = 0.4124564 * linearR + 0.3575761 * linearG + 0.1804375 * linearB;
  const y = 0.2126729 * linearR + 0.7151522 * linearG + 0.0721750 * linearB;
  const z = 0.0193339 * linearR + 0.1191920 * linearG + 0.9503041 * linearB;

  const targetY = 0.52;
  const targetS = 0.15;

  const l = targetY;
  const s = targetS;
  const h = 195;

  return `oklch(${l.toFixed(2)} ${s.toFixed(2)} ${h})`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [primaryColor, setPrimaryColor] = useState('#267E54');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTheme = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('parametres')
          .select('couleur_principale')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!error && data?.couleur_principale) {
          setPrimaryColor(data.couleur_principale);
        }
      } catch (err) {
        console.warn('Error fetching theme:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTheme();
  }, [user]);

  useEffect(() => {
    if (!primaryColor) return;

    const root = document.documentElement;
    const oklchColor = hexToOklch(primaryColor);

    root.style.setProperty('--primary', oklchColor);
    root.style.setProperty('--ring', oklchColor);
    root.style.setProperty('--sidebar-primary', oklchColor);
    root.style.setProperty('--sidebar-ring', oklchColor);
    root.style.setProperty('--chart-1', oklchColor);

    const r = parseInt(primaryColor.slice(1, 3), 16) / 255;
    const g = parseInt(primaryColor.slice(3, 5), 16) / 255;
    const b = parseInt(primaryColor.slice(5, 7), 16) / 255;

    root.style.setProperty('--primary-rgb', `${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}`);
  }, [primaryColor]);

  return (
    <ThemeContext.Provider 
      value={{ 
        primaryColor, 
        primaryColorOklch: hexToOklch(primaryColor),
        loading 
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
