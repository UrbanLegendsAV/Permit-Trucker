import { Button } from "@/components/ui/button";
import { Printer, Download, ArrowLeft, FileText, MapPin, Globe, Calendar } from "lucide-react";
import { format } from "date-fns";
import type { Town, Profile } from "@shared/schema";

interface PermitPacketProps {
  town: Town;
  profile: Profile;
  permitType: "yearly" | "temporary" | "seasonal";
  signature?: string | null;
  onClose: () => void;
}

const permitTypeLabels = {
  yearly: "Yearly Permit Application",
  temporary: "Temporary / Event Permit Application",
  seasonal: "Seasonal / Market Permit Application",
};

export function PermitPacket({ town, profile, permitType, signature, onClose }: PermitPacketProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-background" data-testid="permit-packet-container">
      <div className="print:hidden sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <Button variant="ghost" onClick={onClose} data-testid="button-close-packet">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrint} data-testid="button-print-packet">
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
            <Button onClick={handlePrint} data-testid="button-download-packet">
              <Download className="w-4 h-4 mr-2" />
              Save as PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 print:p-0 print:max-w-none">
        <div className="bg-white dark:bg-card print:bg-white rounded-lg print:rounded-none shadow-sm print:shadow-none">
          <div className="p-8 space-y-8 print:text-black">
            <header className="text-center border-b pb-6 print:border-black">
              <h1 className="text-2xl font-bold mb-2" data-testid="text-packet-town-name">
                {town.townName}, {town.state}
              </h1>
              <h2 className="text-xl text-muted-foreground print:text-gray-600" data-testid="text-packet-permit-type">
                {permitTypeLabels[permitType]}
              </h2>
              <p className="text-sm text-muted-foreground print:text-gray-500 mt-2" data-testid="text-packet-date">
                Generated on {format(new Date(), "MMMM d, yyyy")}
              </p>
            </header>

            <section className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2 flex items-center gap-2 print:border-black">
                <FileText className="w-5 h-5 print:hidden" />
                Town Requirements
              </h3>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground print:text-gray-500">Permit Fee:</span>
                  <span className="ml-2 font-medium" data-testid="text-packet-fee">
                    ${town.requirementsJson?.fees?.[permitType] || "Contact Town"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground print:text-gray-500">Form Type:</span>
                  <span className="ml-2 font-medium capitalize" data-testid="text-packet-form-type">
                    {town.formType?.replace("_", " ") || "PDF Form"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground print:text-gray-500">Confidence Score:</span>
                  <span className="ml-2 font-medium" data-testid="text-packet-confidence">
                    {town.confidenceScore || 0}%
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground print:text-gray-500">Last Verified:</span>
                  <span className="ml-2 font-medium" data-testid="text-packet-last-verified">
                    {town.lastVerified ? format(new Date(town.lastVerified), "MMM d, yyyy") : "Not verified"}
                  </span>
                </div>
              </div>

              {town.requirementsJson?.notes && town.requirementsJson.notes.length > 0 && (
                <div className="mt-4 p-4 bg-muted/50 print:bg-gray-100 rounded-lg print:rounded">
                  <h4 className="font-medium mb-2">Additional Notes</h4>
                  <ul className="text-sm list-disc list-inside space-y-1" data-testid="list-packet-notes">
                    {town.requirementsJson.notes.map((note, i) => (
                      <li key={i} data-testid={`text-packet-note-${i}`}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              {town.portalUrl && (
                <div className="mt-4 p-4 border rounded-lg print:border-black">
                  <h4 className="font-medium mb-2">Town Portal</h4>
                  <div className="space-y-1 text-sm">
                    <p className="flex items-center gap-2" data-testid="text-packet-portal-url">
                      <Globe className="w-4 h-4 print:hidden" />
                      {town.portalUrl}
                    </p>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2 flex items-center gap-2 print:border-black">
                <MapPin className="w-5 h-5 print:hidden" />
                Applicant Information
              </h3>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground print:text-gray-500">Business Name:</span>
                  <span className="ml-2 font-medium" data-testid="text-packet-business-name">
                    {profile.vehicleName || "_________________________"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground print:text-gray-500">Vehicle Type:</span>
                  <span className="ml-2 font-medium capitalize" data-testid="text-packet-vehicle-type">
                    {profile.vehicleType}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground print:text-gray-500">VIN/Plate:</span>
                  <span className="ml-2 font-medium" data-testid="text-packet-vin-plate">
                    {profile.vinPlate || "_________________________"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground print:text-gray-500">Menu Type:</span>
                  <span className="ml-2 font-medium" data-testid="text-packet-menu-type">
                    {profile.menuType || "_________________________"}
                  </span>
                </div>
                {profile.commissaryName && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground print:text-gray-500">Commissary:</span>
                    <span className="ml-2 font-medium" data-testid="text-packet-commissary">
                      {profile.commissaryName}
                      {profile.commissaryAddress && ` - ${profile.commissaryAddress}`}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                <div>
                  <span className="text-muted-foreground print:text-gray-500">Has Propane:</span>
                  <span className="ml-2 font-medium" data-testid="text-packet-has-propane">
                    {profile.hasPropane ? "Yes" : "No"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground print:text-gray-500">QFO Certified:</span>
                  <span className="ml-2 font-medium" data-testid="text-packet-qfo-cert">
                    {profile.hasQfoCert ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2 flex items-center gap-2 print:border-black">
                <Calendar className="w-5 h-5 print:hidden" />
                Required Documents Checklist
              </h3>
              
              <div className="space-y-2 text-sm" data-testid="list-packet-checklist">
                {[
                  "State Health Department Food Service License",
                  "Food Handler Certification",
                  "Vehicle Registration",
                  "Proof of Insurance (Liability)",
                  "Commissary Agreement Letter",
                  "Menu with Prices",
                  "Fire Safety Inspection (if applicable)",
                  "Propane/LPG Certification (if applicable)",
                ].map((doc, index) => (
                  <div key={index} className="flex items-center gap-2" data-testid={`item-checklist-${index}`}>
                    <div className="w-4 h-4 border border-current rounded-sm print:border-black" />
                    <span>{doc}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4 print:break-before-page">
              <h3 className="text-lg font-semibold border-b pb-2 print:border-black">
                Certification & Signature
              </h3>
              
              <div className="text-sm space-y-4">
                <p>
                  I hereby certify that all information provided in this application is true and accurate 
                  to the best of my knowledge. I understand that providing false information may result 
                  in denial or revocation of the permit.
                </p>
                <p>
                  I agree to comply with all local, state, and federal health and safety regulations 
                  governing mobile food vending operations.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-8 pt-4">
                <div>
                  <div className="border-b border-black h-16 mb-2 flex items-end justify-center" data-testid="container-signature">
                    {signature && (
                      <img 
                        src={signature} 
                        alt="Signature" 
                        className="max-h-14 max-w-full object-contain"
                        data-testid="img-signature"
                      />
                    )}
                  </div>
                  <p className="text-sm text-center">Signature</p>
                </div>
                <div>
                  <div className="border-b border-black h-16 mb-2 flex items-end justify-center">
                    <span className="text-sm pb-1" data-testid="text-packet-sign-date">
                      {format(new Date(), "MM/dd/yyyy")}
                    </span>
                  </div>
                  <p className="text-sm text-center">Date</p>
                </div>
              </div>
            </section>

            <footer className="text-center text-xs text-muted-foreground print:text-gray-500 pt-8 border-t print:border-black">
              <p>
                This document was generated by PermitTruck. Always verify requirements with the 
                {" "}{town.townName} town clerk or health department before submitting your application.
              </p>
              <p className="mt-2" data-testid="text-packet-confidence-note">
                Confidence Score: {town.confidenceScore || 0}% - 
                {(town.confidenceScore || 0) < 50 
                  ? " Requirements may be outdated. Please verify with official sources."
                  : " Requirements have been recently verified."}
              </p>
            </footer>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:bg-white {
            background-color: white !important;
          }
          .print\\:text-black {
            color: black !important;
          }
          .print\\:text-gray-500 {
            color: #6b7280 !important;
          }
          .print\\:text-gray-600 {
            color: #4b5563 !important;
          }
          .print\\:border-black {
            border-color: black !important;
          }
          .print\\:bg-gray-100 {
            background-color: #f3f4f6 !important;
          }
          .print\\:break-before-page {
            break-before: page;
          }
          .print\\:rounded-none {
            border-radius: 0 !important;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          .print\\:p-0 {
            padding: 0 !important;
          }
          .print\\:max-w-none {
            max-width: none !important;
          }
          .print\\:rounded {
            border-radius: 0.25rem !important;
          }
        }
      `}</style>
    </div>
  );
}
