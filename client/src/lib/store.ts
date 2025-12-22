import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Profile, Permit, Town, Badge } from '@shared/schema';

interface OnboardingData {
  vehicleType: 'truck' | 'trailer' | null;
  vehicleName: string;
  vinPlate: string;
  menuType: string;
  hasPropane: boolean;
  hasQfoCert: boolean;
  commissaryName: string;
  commissaryAddress: string;
  documents: Array<{ name: string; type: string; url: string }>;
  wantsPublicProfile: boolean;
  publicBusinessName: string;
  publicDescription: string;
}

interface NewPermitData {
  permitType: 'yearly' | 'temporary' | 'seasonal' | null;
  state: string;
  county: string;
  townId: string | null;
  town: Town | null;
  profileId: string | null;
  checklistProgress: Record<string, boolean>;
  signatureData: string | null;
}

interface AppState {
  onboarding: OnboardingData;
  newPermit: NewPermitData;
  currentStep: number;
  permitStep: number;
  
  setOnboardingField: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  setOnboarding: (data: Partial<OnboardingData>) => void;
  resetOnboarding: () => void;
  setCurrentStep: (step: number) => void;
  
  setNewPermitField: <K extends keyof NewPermitData>(key: K, value: NewPermitData[K]) => void;
  setNewPermit: (data: Partial<NewPermitData>) => void;
  resetNewPermit: () => void;
  setPermitStep: (step: number) => void;
  toggleChecklistItem: (key: string) => void;
}

const initialOnboarding: OnboardingData = {
  vehicleType: null,
  vehicleName: '',
  vinPlate: '',
  menuType: '',
  hasPropane: false,
  hasQfoCert: false,
  commissaryName: '',
  commissaryAddress: '',
  documents: [],
  wantsPublicProfile: false,
  publicBusinessName: '',
  publicDescription: '',
};

const initialNewPermit: NewPermitData = {
  permitType: null,
  state: 'CT',
  county: '',
  townId: null,
  town: null,
  profileId: null,
  checklistProgress: {},
  signatureData: null,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      onboarding: initialOnboarding,
      newPermit: initialNewPermit,
      currentStep: 0,
      permitStep: 0,
      
      setOnboardingField: (key, value) =>
        set((state) => ({
          onboarding: { ...state.onboarding, [key]: value },
        })),
      
      setOnboarding: (data) =>
        set((state) => ({
          onboarding: { ...state.onboarding, ...data },
        })),
      
      resetOnboarding: () =>
        set({ onboarding: initialOnboarding, currentStep: 0 }),
      
      setCurrentStep: (step) => set({ currentStep: step }),
      
      setNewPermitField: (key, value) =>
        set((state) => ({
          newPermit: { ...state.newPermit, [key]: value },
        })),
      
      setNewPermit: (data) =>
        set((state) => ({
          newPermit: { ...state.newPermit, ...data },
        })),
      
      resetNewPermit: () =>
        set({ newPermit: initialNewPermit, permitStep: 0 }),
      
      setPermitStep: (step) => set({ permitStep: step }),
      
      toggleChecklistItem: (key) =>
        set((state) => ({
          newPermit: {
            ...state.newPermit,
            checklistProgress: {
              ...state.newPermit.checklistProgress,
              [key]: !state.newPermit.checklistProgress[key],
            },
          },
        })),
    }),
    {
      name: 'permittruck-storage',
      partialize: (state) => ({
        onboarding: state.onboarding,
        currentStep: state.currentStep,
      }),
    }
  )
);
