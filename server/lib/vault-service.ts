import { storage } from "../storage";
import type { DataVault, InsertDataVault, Profile } from "@shared/schema";

interface ParsedDataLog {
  contact_info?: {
    business_name?: { value: string; confidence: number };
    applicant_name?: { value: string; confidence: number };
    phone?: { value: string; confidence: number };
    email?: { value: string; confidence: number };
    mailing_address?: { value: string; confidence: number };
  };
  operations?: {
    water_supply_type?: { value: string; confidence: number };
    sanitizer_type?: { value: string; confidence: number };
    sanitizing_method?: { value: string; confidence: number };
    toilet_facilities?: { value: string; confidence: number };
  };
  safety?: {
    hot_holding_method?: { value: string; confidence: number };
    cold_storage_method?: { value: string; confidence: number };
    waste_water_disposal?: { value: string; confidence: number };
    temperature_monitoring_method?: { value: string; confidence: number };
  };
  license_info?: {
    license_type?: { value: string; confidence: number };
    issuing_authority?: { value: string; confidence: number };
    license_number?: { value: string; confidence: number };
    valid_from?: { value: string; confidence: number };
    valid_thru?: { value: string; confidence: number };
    towns_covered?: { value: string; confidence: number };
  };
  menu_and_prep?: {
    food_items_list?: { value: string; confidence: number };
    prep_location?: { value: string; confidence: number };
    food_source_location?: { value: string; confidence: number };
  };
  _meta?: {
    document_type?: string;
    fields_found?: number;
    high_confidence_count?: number;
    medium_confidence_count?: number;
    low_confidence_count?: number;
  };
}

function parseAddress(addressStr: string): { street?: string; city?: string; state?: string; zip?: string } {
  if (!addressStr) return {};
  
  const parts = addressStr.split(",").map(p => p.trim());
  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 1];
    const stateZipMatch = lastPart.match(/([A-Z]{2})\s*(\d{5}(-\d{4})?)?/i);
    
    return {
      street: parts[0],
      city: parts.length > 2 ? parts[parts.length - 2] : undefined,
      state: stateZipMatch ? stateZipMatch[1].toUpperCase() : undefined,
      zip: stateZipMatch ? stateZipMatch[2] : undefined,
    };
  }
  
  return { street: addressStr };
}

export async function syncParsedDataToVault(profileId: string): Promise<DataVault | null> {
  const profile = await storage.getProfile(profileId);
  if (!profile) {
    console.error(`Profile not found: ${profileId}`);
    return null;
  }

  const parsedLog = profile.parsedDataLog as ParsedDataLog | null;
  if (!parsedLog) {
    console.log(`No parsed data log for profile: ${profileId}`);
    return null;
  }

  let vault = await storage.getDataVaultByProfileId(profileId);
  
  const confidenceScores: Record<string, number> = {};
  const fieldSources: Record<string, string> = {};

  const vaultData: Partial<InsertDataVault> = {
    userId: profile.userId,
    profileId: profile.id,
  };

  if (parsedLog.contact_info) {
    const ci = parsedLog.contact_info;
    
    if (ci.business_name?.value) {
      vaultData.businessName = ci.business_name.value;
      confidenceScores.businessName = ci.business_name.confidence;
      fieldSources.businessName = "parsed_document";
    }
    
    if (ci.applicant_name?.value) {
      vaultData.ownerName = ci.applicant_name.value;
      confidenceScores.ownerName = ci.applicant_name.confidence;
      fieldSources.ownerName = "parsed_document";
    }
    
    if (ci.phone?.value) {
      vaultData.phone = ci.phone.value;
      confidenceScores.phone = ci.phone.confidence;
      fieldSources.phone = "parsed_document";
    }
    
    if (ci.email?.value) {
      vaultData.email = ci.email.value;
      confidenceScores.email = ci.email.confidence;
      fieldSources.email = "parsed_document";
    }
    
    if (ci.mailing_address?.value) {
      const addr = parseAddress(ci.mailing_address.value);
      if (addr.street) vaultData.mailingStreet = addr.street;
      if (addr.city) vaultData.mailingCity = addr.city;
      if (addr.state) vaultData.mailingState = addr.state;
      if (addr.zip) vaultData.mailingZip = addr.zip;
      confidenceScores.mailingAddress = ci.mailing_address.confidence;
      fieldSources.mailingAddress = "parsed_document";
    }
  }

  if (parsedLog.operations) {
    const ops = parsedLog.operations;
    
    if (ops.water_supply_type?.value) {
      vaultData.waterSupplyType = ops.water_supply_type.value;
      confidenceScores.waterSupplyType = ops.water_supply_type.confidence;
      fieldSources.waterSupplyType = "parsed_document";
    }
    
    if (ops.sanitizer_type?.value) {
      vaultData.sanitizerType = ops.sanitizer_type.value;
      confidenceScores.sanitizerType = ops.sanitizer_type.confidence;
      fieldSources.sanitizerType = "parsed_document";
    }
  }

  if (parsedLog.safety) {
    const safety = parsedLog.safety;
    
    if (safety.hot_holding_method?.value) {
      vaultData.hotHoldingMethod = safety.hot_holding_method.value;
      vaultData.hasHotHoldingEquipment = true;
      confidenceScores.hotHoldingMethod = safety.hot_holding_method.confidence;
      fieldSources.hotHoldingMethod = "parsed_document";
    }
    
    if (safety.cold_storage_method?.value) {
      vaultData.coldHoldingMethod = safety.cold_storage_method.value;
      vaultData.hasColdHoldingEquipment = true;
      confidenceScores.coldHoldingMethod = safety.cold_storage_method.confidence;
      fieldSources.coldHoldingMethod = "parsed_document";
    }
  }

  if (parsedLog.menu_and_prep) {
    const mp = parsedLog.menu_and_prep;
    
    if (mp.food_items_list?.value) {
      vaultData.menuDescription = mp.food_items_list.value;
      const items = mp.food_items_list.value.split(/[,;]/).map(i => i.trim()).filter(Boolean);
      vaultData.foodItemsList = items;
      confidenceScores.menuDescription = mp.food_items_list.confidence;
      fieldSources.menuDescription = "parsed_document";
    }
    
    if (mp.prep_location?.value) {
      vaultData.prepLocationDescription = mp.prep_location.value;
      confidenceScores.prepLocation = mp.prep_location.confidence;
      fieldSources.prepLocation = "parsed_document";
    }
    
    if (mp.food_source_location?.value) {
      const sources = mp.food_source_location.value.split(/[,;]/).map(s => s.trim()).filter(Boolean);
      vaultData.foodSourceLocations = sources;
      confidenceScores.foodSources = mp.food_source_location.confidence;
      fieldSources.foodSources = "parsed_document";
    }
  }

  if (profile.commissaryName) {
    vaultData.commissaryName = profile.commissaryName;
    confidenceScores.commissaryName = 100;
    fieldSources.commissaryName = "profile";
  }
  
  if (profile.commissaryAddress) {
    vaultData.commissaryAddress = profile.commissaryAddress;
    confidenceScores.commissaryAddress = 100;
    fieldSources.commissaryAddress = "profile";
  }
  
  if (profile.hasPropane !== undefined) {
    vaultData.hasPropane = profile.hasPropane;
  }

  if (profile.vehicleType) {
    vaultData.vehicleType = profile.vehicleType;
  }

  vaultData.confidenceScores = confidenceScores;
  vaultData.fieldSources = fieldSources;
  vaultData.lastSyncedFromParsedLog = new Date();

  if (vault) {
    return await storage.updateDataVault(vault.id, vaultData) ?? null;
  } else {
    return await storage.createDataVault(vaultData as InsertDataVault);
  }
}

export function getVaultDataForPdfFill(vault: DataVault): Record<string, { value: string; description: string }> {
  const fieldData: Record<string, { value: string; description: string }> = {};

  if (vault.businessName) {
    fieldData.business_name = { value: vault.businessName, description: "Name of the business or food truck" };
  }
  if (vault.tradeName) {
    fieldData.trade_name = { value: vault.tradeName, description: "Trade name or DBA" };
  }
  if (vault.ownerName) {
    fieldData.owner_name = { value: vault.ownerName, description: "Full name of the owner or applicant" };
  }
  if (vault.phone) {
    fieldData.phone = { value: vault.phone, description: "Primary phone number" };
  }
  if (vault.email) {
    fieldData.email = { value: vault.email, description: "Email address" };
  }
  
  if (vault.mailingStreet) {
    const fullAddress = [
      vault.mailingStreet,
      vault.mailingCity,
      vault.mailingState,
      vault.mailingZip
    ].filter(Boolean).join(", ");
    fieldData.mailing_address = { value: fullAddress, description: "Mailing address" };
  }
  
  if (vault.vehicleLicensePlate) {
    fieldData.license_plate = { value: vault.vehicleLicensePlate, description: "Vehicle license plate number" };
  }
  if (vault.vehicleVin) {
    fieldData.vin = { value: vault.vehicleVin, description: "Vehicle Identification Number (VIN)" };
  }
  if (vault.vehicleType) {
    fieldData.vehicle_type = { value: vault.vehicleType, description: "Type of vehicle (truck or trailer)" };
  }
  
  if (vault.waterSupplyType) {
    fieldData.water_supply = { value: vault.waterSupplyType, description: "Type of water supply (public, private, bottled)" };
  }
  if (vault.sanitizerType) {
    fieldData.sanitizer = { value: vault.sanitizerType, description: "Type of sanitizer used" };
  }
  
  if (vault.commissaryName) {
    fieldData.commissary_name = { value: vault.commissaryName, description: "Name of commissary facility" };
  }
  if (vault.commissaryAddress) {
    fieldData.commissary_address = { value: vault.commissaryAddress, description: "Address of commissary facility" };
  }
  
  if (vault.menuDescription) {
    fieldData.menu = { value: vault.menuDescription, description: "Description of food items served" };
  }
  if (vault.prepLocationDescription) {
    fieldData.prep_location = { value: vault.prepLocationDescription, description: "Location where food is prepared" };
  }
  
  if (vault.hotHoldingMethod) {
    fieldData.hot_holding = { value: vault.hotHoldingMethod, description: "Method for hot holding foods at safe temperatures" };
  }
  if (vault.coldHoldingMethod) {
    fieldData.cold_holding = { value: vault.coldHoldingMethod, description: "Method for cold holding foods at safe temperatures" };
  }

  return fieldData;
}

export async function getVaultCompleteness(vaultId: string): Promise<{ 
  score: number; 
  missingFields: string[]; 
  lowConfidenceFields: string[] 
}> {
  const vault = await storage.getDataVault(vaultId);
  if (!vault) {
    return { score: 0, missingFields: ["vault_not_found"], lowConfidenceFields: [] };
  }

  const requiredFields = [
    { key: "businessName", label: "Business Name" },
    { key: "ownerName", label: "Owner Name" },
    { key: "phone", label: "Phone Number" },
    { key: "email", label: "Email Address" },
    { key: "mailingStreet", label: "Mailing Address" },
    { key: "commissaryName", label: "Commissary Name" },
    { key: "commissaryAddress", label: "Commissary Address" },
  ];

  const missingFields: string[] = [];
  const lowConfidenceFields: string[] = [];

  for (const field of requiredFields) {
    const value = vault[field.key as keyof DataVault];
    if (!value) {
      missingFields.push(field.label);
    } else if (vault.confidenceScores && vault.confidenceScores[field.key] && vault.confidenceScores[field.key] < 80) {
      lowConfidenceFields.push(field.label);
    }
  }

  const totalFields = requiredFields.length;
  const filledFields = totalFields - missingFields.length;
  const score = Math.round((filledFields / totalFields) * 100);

  return { score, missingFields, lowConfidenceFields };
}
