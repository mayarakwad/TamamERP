import "server-only";
import { readFile } from "node:fs/promises";
import { storagePath } from "./storage";

export interface Branding {
  name: string;
  nameAr: string | null;
  address: string | null;
  addressAr: string | null;
  phone: string | null;
  email: string | null;
  crNumber: string | null;
  brandColor: string;
  currency: string;
  timezone: string;
  /** PNG logo as a data: URL, or null */
  logo: string | null;
  /** Raw PNG bytes for Excel/Word */
  logoPng: Buffer | null;
}

/** Everything a printed or exported document needs to carry the organization's identity. */
export async function getBranding(org: {
  name: string;
  nameAr: string | null;
  address: string | null;
  addressAr: string | null;
  phone: string | null;
  email: string | null;
  crNumber: string | null;
  brandColor: string | null;
  currency: string;
  timezone: string;
  logoPath: string | null;
}): Promise<Branding> {
  let logoPng: Buffer | null = null;
  if (org.logoPath && /^orgs\/[a-z0-9]+\/logo\.png$/.test(org.logoPath)) {
    logoPng = await readFile(storagePath(...org.logoPath.split("/"))).catch(() => null);
  }
  return {
    name: org.name,
    nameAr: org.nameAr,
    address: org.address,
    addressAr: org.addressAr,
    phone: org.phone,
    email: org.email,
    crNumber: org.crNumber,
    brandColor: org.brandColor ?? "#8A1538",
    currency: org.currency,
    timezone: org.timezone,
    logo: logoPng ? `data:image/png;base64,${logoPng.toString("base64")}` : null,
    logoPng,
  };
}
