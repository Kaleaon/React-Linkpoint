import {
  auth,
  initGoogleAuth,
  signInWithGoogle,
  signOutGoogle,
  getGoogleAccessToken,
  GOOGLE_WORKSPACE_SCOPES,
} from "./googleAuth";

export {
  auth,
  initGoogleAuth,
  signInWithGoogle,
  signOutGoogle,
  getGoogleAccessToken,
  GOOGLE_WORKSPACE_SCOPES,
};

export const GOOGLE_CONTACTS_SCOPES = GOOGLE_WORKSPACE_SCOPES.filter((s) =>
  s.includes("contacts") || s.includes("directory") || s.includes("user.")
);

export interface GoogleContact {
  resourceName: string;
  etag: string;
  displayName: string;
  givenName?: string;
  familyName?: string;
  photoUrl?: string;
  email?: string;
  phone?: string;
  organization?: string;
  jobTitle?: string;
  biography?: string;
  slUuid?: string;
  slName?: string;
  slGrid?: string;
  isSLContact: boolean;
}

export const fetchGoogleContacts = async (): Promise<GoogleContact[]> => {
  const token = await getGoogleAccessToken();
  if (!token) throw new Error("Not signed in to Google.");

  const personFields = "names,photos,emailAddresses,phoneNumbers,organizations,biographies,userDefined,urls";
  const url = `https://people.googleapis.com/v1/people/me/connections?personFields=${encodeURIComponent(
    personFields
  )}&pageSize=100`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google People API error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const connections = data.connections || [];

  return connections.map((c: any) => {
    const nameObj = c.names?.[0] || {};
    const photoObj = c.photos?.find((p: any) => !p.default) || c.photos?.[0] || {};
    const emailObj = c.emailAddresses?.[0] || {};
    const phoneObj = c.phoneNumbers?.[0] || {};
    const orgObj = c.organizations?.[0] || {};
    const bioObj = c.biographies?.[0] || {};

    const userDefined = c.userDefined || [];
    const slUuidObj = userDefined.find((u: any) => u.key === "SL_UUID");
    const slNameObj = userDefined.find((u: any) => u.key === "SL_NAME");
    const slGridObj = userDefined.find((u: any) => u.key === "SL_GRID");

    const isSLContact = Boolean(
      slUuidObj?.value ||
      orgObj.name?.toLowerCase?.().includes("second life") ||
      bioObj.value?.includes("Second Life")
    );

    return {
      resourceName: c.resourceName,
      etag: c.etag,
      displayName: nameObj.displayName || nameObj.unstructuredName || "Unnamed Contact",
      givenName: nameObj.givenName || "",
      familyName: nameObj.familyName || "",
      photoUrl: photoObj.url || null,
      email: emailObj.value || null,
      phone: phoneObj.value || null,
      organization: orgObj.name || null,
      jobTitle: orgObj.title || null,
      biography: bioObj.value || null,
      slUuid: slUuidObj?.value || null,
      slName: slNameObj?.value || null,
      slGrid: slGridObj?.value || null,
      isSLContact,
    };
  });
};

/**
 * Generate a high quality 256x256 avatar portrait JPEG base64 (stripped of prefix)
 */
export const generateAvatarCanvasPhotoBase64 = (friend: { id?: string; name: string }): string => {
  if (typeof document === "undefined") return "";

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Derive vibrant colors from friend name or UUID
  const seed = (friend.id || friend.name || "SL")
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue = seed % 360;

  // 1. Sleek dark cyberpunk backdrop
  const bgGrad = ctx.createLinearGradient(0, 0, 256, 256);
  bgGrad.addColorStop(0, `hsl(${hue}, 45%, 12%)`);
  bgGrad.addColorStop(1, `hsl(${(hue + 40) % 360}, 50%, 6%)`);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 256, 256);

  // 2. Subtle grid matrix lines
  ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.12)`;
  ctx.lineWidth = 1;
  for (let x = 16; x < 256; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  for (let y = 16; y < 256; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  // 3. Central glowing avatar orb
  const orbGrad = ctx.createRadialGradient(128, 116, 10, 128, 116, 74);
  orbGrad.addColorStop(0, `hsl(${hue}, 90%, 55%)`);
  orbGrad.addColorStop(0.7, `hsl(${(hue + 30) % 360}, 80%, 40%)`);
  orbGrad.addColorStop(1, `hsl(${hue}, 70%, 25%)`);

  ctx.shadowColor = `hsla(${hue}, 100%, 65%, 0.6)`;
  ctx.shadowBlur = 18;
  ctx.fillStyle = orbGrad;
  ctx.beginPath();
  ctx.arc(128, 116, 64, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // 4. Resident Initials
  const parts = (friend.name || "SL Resident").trim().split(/\s+/);
  const initials = (
    parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : parts[0].slice(0, 2)
  ).toUpperCase();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 44px 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials, 128, 116);

  // 5. Bottom "SECOND LIFE" pill badge
  ctx.fillStyle = "rgba(10, 25, 20, 0.88)";
  ctx.strokeStyle = `hsl(${hue}, 80%, 55%)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(40, 204, 176, 28, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = `hsl(${hue}, 90%, 75%)`;
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.letterSpacing = "2px";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SECOND LIFE", 128, 218);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  return dataUrl.replace(/^data:image\/[a-z]+;base64,/, "");
};

/**
 * Fetch avatar photo base64 bytes:
 * Checks server endpoint for real SL profile photo, falling back to procedural canvas avatar
 */
export const getAvatarPhotoBytes = async (friend: {
  id?: string;
  name: string;
}): Promise<string> => {
  try {
    const avatarId = friend.id || "";
    const name = encodeURIComponent(friend.name || "");
    const res = await fetch(`/api/sl/avatar/photo?avatarId=${avatarId}&name=${name}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.photoBytes) {
        return data.photoBytes.replace(/^data:image\/[a-z]+;base64,/, "");
      }
    }
  } catch (err) {
    console.warn("[Google Contacts] Remote avatar photo fetch warning:", err);
  }

  // Fallback to crisp procedural canvas avatar JPEG
  return generateAvatarCanvasPhotoBase64(friend);
};

/**
 * Update contact photo in Google Contacts
 */
export const updateGoogleContactPhoto = async (
  resourceName: string,
  photoBytes: string
): Promise<any> => {
  const token = await getGoogleAccessToken();
  if (!token) throw new Error("Not signed in to Google.");

  const cleanBytes = photoBytes.replace(/^data:image\/[a-z]+;base64,/, "").trim();
  const url = `https://people.googleapis.com/v1/${resourceName}:updateContactPhoto`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      photoBytes: cleanBytes,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.warn(`[Google Contacts] updateContactPhoto warning (${res.status}): ${errText}`);
    // Non-fatal if photo upload fails or has size limits
    return null;
  }

  return await res.json();
};

/**
 * Add a Second Life friend to Google Contacts with profile info and avatar icon/photo
 */
export const addSLFriendToGoogleContacts = async (
  friend: {
    id: string;
    name: string;
    onlineStatus?: string;
    permissions?: any;
  },
  customNote: string = ""
): Promise<any> => {
  const token = await getGoogleAccessToken();
  if (!token) throw new Error("Please sign in with Google first.");

  const nameParts = (friend.name || "SL Resident").trim().split(/\s+/);
  const givenName = nameParts[0] || "Resident";
  const familyName = nameParts.slice(1).join(" ") || "SL";
  const username = friend.name.toLowerCase().replace(/\s+/g, ".");

  const biography = [
    `Second Life Resident: ${friend.name}`,
    `UUID: ${friend.id}`,
    `Grid: Second Life (Agni)`,
    `Online Status: ${friend.onlineStatus || "offline"}`,
    customNote ? `Note: ${customNote}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const contactPayload = {
    names: [
      {
        givenName,
        familyName,
        displayName: friend.name,
      },
    ],
    nicknames: [
      {
        value: friend.name,
      },
    ],
    organizations: [
      {
        name: "Second Life",
        title: "Resident",
        type: "work",
      },
    ],
    biographies: [
      {
        value: biography,
        contentType: "TEXT_PLAIN",
      },
    ],
    userDefined: [
      { key: "SL_UUID", value: friend.id },
      { key: "SL_NAME", value: friend.name },
      { key: "SL_GRID", value: "Second Life" },
    ],
    urls: [
      {
        value: `https://my.secondlife.com/${username}`,
        type: "profile",
      },
    ],
  };

  const createRes = await fetch("https://people.googleapis.com/v1/people:createContact", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(contactPayload),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create contact in Google: ${errText}`);
  }

  const createdPerson = await createRes.json();
  const resourceName = createdPerson.resourceName;

  // Now upload avatar icon/photo
  try {
    const photoBytes = await getAvatarPhotoBytes(friend);
    if (photoBytes && resourceName) {
      await updateGoogleContactPhoto(resourceName, photoBytes);
    }
  } catch (photoErr) {
    console.warn("[Google Contacts] Contact photo upload non-fatal error:", photoErr);
  }

  return createdPerson;
};

/**
 * Delete a contact from Google Contacts
 */
export const deleteGoogleContact = async (resourceName: string): Promise<boolean> => {
  const token = await getGoogleAccessToken();
  if (!token) throw new Error("Not signed in to Google.");

  const res = await fetch(`https://people.googleapis.com/v1/${resourceName}:deleteContact`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to delete contact: ${errText}`);
  }

  return true;
};
