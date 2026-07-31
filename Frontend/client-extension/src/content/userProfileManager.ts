// ─────────────────────────────────────────────────────────────────────────────
// UserProfileManager — Secure User Profile Memory & Preference Storage
// ─────────────────────────────────────────────────────────────────────────────

export interface UserProfileData {
  name: string;
  fullName?: string;
  email: string;
  phone: string;
  dob: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pinCode: string;
  postalCode?: string;
  gender?: string;
  skills: string;
  education: string;
  experience: string;
  resumeDetails: string;
  preferences: {
    preferredDeliveryAddress: string;
    preferredPaymentMethod: string;
    preferredShippingOption: string;
  };
}

export const DEFAULT_USER_PROFILE: UserProfileData = {
  name: "Alex Morgan",
  fullName: "Alex Morgan",
  email: "alex.morgan@example.com",
  phone: "+1-555-019-2834",
  dob: "1995-08-15",
  address: "742 Evergreen Terrace",
  city: "Springfield",
  state: "IL",
  country: "United States",
  pinCode: "62704",
  postalCode: "62704",
  gender: "",
  skills: "TypeScript, Python, Web Accessibility, React, FastAPI",
  education: "B.S. Computer Science, Stanford University",
  experience: "5 years Software Engineer at Tech Corp",
  resumeDetails: "Senior Developer with expertise in web automation and accessibility.",
  preferences: {
    preferredDeliveryAddress: "742 Evergreen Terrace, Springfield, IL 62704",
    preferredPaymentMethod: "Credit Card",
    preferredShippingOption: "Express Delivery",
  },
};

export class UserProfileManager {
  private cache: UserProfileData = { ...DEFAULT_USER_PROFILE };
  private storageKey = "neuroUserProfile";

  constructor() {
    this.init();
  }

  private async init() {
    await this.loadProfile();
  }

  /**
   * Loads profile from chrome.storage.local or returns default
   */
  public async loadProfile(): Promise<UserProfileData> {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get([this.storageKey], (result) => {
            if (result && result[this.storageKey]) {
              this.cache = this.normalizeProfile({ ...DEFAULT_USER_PROFILE, ...result[this.storageKey] });
            } else {
              this.cache = this.normalizeProfile({ ...DEFAULT_USER_PROFILE });
              this.saveProfile(this.cache);
            }
            resolve(this.cache);
          });
        } else {
          // LocalStorage fallback for non-extension context or tests
          const saved = localStorage.getItem(this.storageKey);
          if (saved) {
            this.cache = this.normalizeProfile({ ...DEFAULT_USER_PROFILE, ...JSON.parse(saved) });
          }
          resolve(this.cache);
        }
      } catch (e) {
        console.warn("🤖 UserProfileManager: Error loading profile, using default", e);
        resolve(this.cache);
      }
    });
  }

  public getProfile(): UserProfileData {
    return { ...this.cache };
  }

  public async updateProfile(profile: Partial<UserProfileData>): Promise<UserProfileData> {
    return this.saveProfile(profile);
  }

  public async saveProfile(profile: Partial<UserProfileData>): Promise<UserProfileData> {
    this.cache = this.normalizeProfile({ ...this.cache, ...profile });
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ [this.storageKey]: this.cache }, () => {
            console.log("🤖 UserProfileManager: Profile successfully updated.");
            resolve(this.cache);
          });
        } else {
          localStorage.setItem(this.storageKey, JSON.stringify(this.cache));
          resolve(this.cache);
        }
      } catch (e) {
        console.error("🤖 UserProfileManager: Failed to save profile", e);
        resolve(this.cache);
      }
    });
  }

  public async deleteProfile(): Promise<void> {
    this.cache = this.normalizeProfile({ ...DEFAULT_USER_PROFILE });

    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      await new Promise<void>((resolve) => {
        chrome.storage.local.remove([this.storageKey], () => resolve());
      });
      return;
    }

    try {
      localStorage.removeItem(this.storageKey);
    } catch (e) {
      console.warn("🤖 UserProfileManager: Failed to delete profile", e);
    }
  }

  public async resetProfile(): Promise<UserProfileData> {
    await this.deleteProfile();
    await this.saveProfile(DEFAULT_USER_PROFILE);
    return this.cache;
  }

  /**
   * Automatically updates learned user preferences (address, payment method, shipping)
   */
  public async learnPreference(
    key: keyof UserProfileData["preferences"],
    value: string
  ): Promise<void> {
    if (!value) return;
    this.cache.preferences[key] = value;
    await this.saveProfile(this.cache);
    console.log(`🤖 UserProfileManager: Learned user preference -> ${key}: '${value}'`);
  }

  private normalizeProfile(profile: Partial<UserProfileData>): UserProfileData {
    const merged: UserProfileData = {
      ...DEFAULT_USER_PROFILE,
      ...profile,
      fullName: profile.fullName || profile.name || DEFAULT_USER_PROFILE.fullName || DEFAULT_USER_PROFILE.name,
      name: profile.name || profile.fullName || DEFAULT_USER_PROFILE.name,
      postalCode: profile.postalCode || profile.pinCode || DEFAULT_USER_PROFILE.postalCode || DEFAULT_USER_PROFILE.pinCode,
      pinCode: profile.pinCode || profile.postalCode || DEFAULT_USER_PROFILE.pinCode,
      gender: profile.gender || DEFAULT_USER_PROFILE.gender || "",
      preferences: {
        ...DEFAULT_USER_PROFILE.preferences,
        ...(profile.preferences || {}),
      },
    };

    return merged;
  }
}
