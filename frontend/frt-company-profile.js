/** CP-FRT-FLOW-03A — signed company profile persistence and private logo storage. */
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
import { ApiError } from "./session.js";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const imageTypes = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
});
const maxLogoBytes = 3 * 1024 * 1024;
const bucket = "frt-attachments";
const fail = (message, status = 400, code = "FRT_COMPANY_PROFILE_INVALID") => {
  throw new ApiError(message, status, code);
};
const optionalText = (value, max) =>
  value === null ||
  value === undefined ||
  value === "" ||
  (typeof value === "string" && value.length <= max);
const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

export function projectFRTCompanyProfile(
  raw,
  { workspaceId, companyCode } = {},
) {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    raw.workspace_id !== workspaceId ||
    raw.code !== companyCode ||
    typeof raw.name !== "string" ||
    raw.name.trim().length < 2 ||
    raw.name.length > 180 ||
    !optionalText(raw.registered_address, 500) ||
    !optionalText(raw.contact_phone, 120) ||
    !optionalText(raw.contact_email, 180) ||
    !optionalText(raw.logo_path, 500)
  )
    return null;
  const email = raw.contact_email || null;
  if (email && !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email))
    return null;
  return {
    workspaceId,
    companyCode: raw.code,
    legalName: raw.name,
    registeredAddress: raw.registered_address || "",
    contactPhone: raw.contact_phone || "",
    contactEmail: email || "",
    logoPath: raw.logo_path || null,
  };
}

async function readStableWorkspaceContext({ auth, api, userId } = {}) {
  try {
    return await api.context();
  } catch (error) {
    if (
      error?.message !== "Signed workspace context changed during loading." ||
      auth.userId !== userId ||
      !auth.isSignedIn
    )
      throw error;
    // A session/token refresh can invalidate an overlapping context read even
    // when the signed user is unchanged. Retry once; the exact workspace and
    // user are still checked by signedCompanyScope below.
    return api.context();
  }
}

async function signedCompanyScope({
  auth,
  api,
  workspaceId,
  companyCode,
} = {}) {
  if (
    !auth ||
    !api ||
    !uuid.test(workspaceId || "") ||
    !/^[A-Za-z0-9_-]{1,32}$/.test(companyCode || "")
  )
    fail("Invalid FRT workspace or company.");
  const user = await auth.getVerifiedUser(),
    context = await readStableWorkspaceContext({ auth, api, userId: user?.id });
  if (
    !uuid.test(user?.id || "") ||
    auth.userId !== user.id ||
    context?.user_id !== user.id ||
    context?.workspace_id !== workspaceId ||
    context?.profile?.status !== "active"
  )
    fail(
      "Signed FRT session is unavailable.",
      403,
      "FRT_COMPANY_PROFILE_SESSION_INVALID",
    );
  const bootstrap = await api.rpc("frt_bootstrap", {
    p_workspace_id: workspaceId,
  });
  const membership = bootstrap?.membership;
  if (
    membership?.user_id !== user.id ||
    membership?.workspace_id !== workspaceId ||
    membership?.enabled !== true ||
    membership?.status !== "active" ||
    !Array.isArray(bootstrap?.companies)
  )
    fail(
      "Active FRT membership is unavailable.",
      403,
      "FRT_COMPANY_PROFILE_MEMBERSHIP_INVALID",
    );
  const company = bootstrap.companies.find((row) => row?.code === companyCode);
  if (!company)
    fail(
      "Company is not part of the current FRT workspace.",
      403,
      "FRT_COMPANY_PROFILE_COMPANY_INVALID",
    );
  return { userId: user.id, company };
}

export async function loadFRTCompanyProfile({
  auth,
  api,
  workspaceId,
  companyCode,
} = {}) {
  const { company } = await signedCompanyScope({
    auth,
    api,
    workspaceId,
    companyCode,
  });
  const profile = projectFRTCompanyProfile(company, {
    workspaceId,
    companyCode,
  });
  if (!profile)
    fail(
      "Persisted company profile response is invalid.",
      409,
      "FRT_COMPANY_PROFILE_READ_INVALID",
    );
  return profile;
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== "object")
    fail("Company profile is required.");
  const legalName = String(profile.legalName ?? "").trim();
  const registeredAddress = String(profile.registeredAddress ?? "").trim();
  const contactPhone = String(profile.contactPhone ?? "").trim();
  const contactEmail = String(profile.contactEmail ?? "").trim();
  const logoPath =
    profile.logoPath === null ||
    profile.logoPath === undefined ||
    profile.logoPath === ""
      ? null
      : String(profile.logoPath);
  if (legalName.length < 2 || legalName.length > 180)
    fail("Legal company name must contain 2 to 180 characters.");
  if (registeredAddress.length > 500)
    fail("Registered address must not exceed 500 characters.");
  if (contactPhone.length > 120)
    fail("Contact telephone must not exceed 120 characters.");
  if (
    contactEmail.length > 180 ||
    (contactEmail &&
      !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(contactEmail))
  )
    fail("Enter a valid contact email address.");
  if (logoPath !== null && logoPath.length > 500)
    fail("Company logo reference is invalid.");
  return { legalName, registeredAddress, contactPhone, contactEmail, logoPath };
}

export async function saveFRTCompanyProfile({
  auth,
  api,
  workspaceId,
  companyCode,
  profile,
} = {}) {
  await signedCompanyScope({ auth, api, workspaceId, companyCode });
  const values = normalizeProfile(profile);
  const result = await api.rpc("frt_update_company_profile", {
    p_workspace_id: workspaceId,
    p_company_code: companyCode,
    p_legal_name: values.legalName,
    p_registered_address: values.registeredAddress,
    p_contact_phone: values.contactPhone,
    p_contact_email: values.contactEmail,
    p_logo_path: values.logoPath,
  });
  if (result?.saved !== true || result?.company?.code !== companyCode)
    fail(
      "Company profile save was not confirmed. Refresh before retrying.",
      409,
      "FRT_COMPANY_PROFILE_SAVE_UNCONFIRMED",
    );
  const saved = await loadFRTCompanyProfile({
    auth,
    api,
    workspaceId,
    companyCode,
  });
  if (
    saved.legalName !== values.legalName ||
    saved.registeredAddress !== values.registeredAddress ||
    saved.contactPhone !== values.contactPhone ||
    saved.contactEmail !== values.contactEmail ||
    saved.logoPath !== values.logoPath
  )
    fail(
      "Company profile readback differs from the saved values. Refresh before retrying.",
      409,
      "FRT_COMPANY_PROFILE_READBACK_MISMATCH",
    );
  return saved;
}

async function storageRequest({
  auth,
  fetchImpl,
  baseUrl,
  path,
  body,
  method = "POST",
  contentType = "application/json",
} = {}) {
  const actor = auth.userId,
    token = await auth.token();
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetchImpl(baseUrl.replace(/\/$/, "") + path, {
      method,
      mode: "cors",
      redirect: "error",
      cache: "no-store",
      credentials: "omit",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: "Bearer " + token,
        ...(contentType ? { "Content-Type": contentType } : {}),
        ...(method === "POST" && contentType !== "application/json"
          ? { "x-upsert": "false" }
          : {}),
      },
      ...(body === undefined ? {} : { body }),
      signal: controller.signal,
    });
    if (actor !== auth.userId || !auth.isSignedIn)
      fail(
        "Signed identity changed during company storage access.",
        403,
        "FRT_COMPANY_PROFILE_SESSION_CHANGED",
      );
    if (!response.ok)
      throw new ApiError(
        "Company profile storage request rejected (" + response.status + ").",
        response.status,
      );
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function validImageBytes(type, bytes) {
  const starts = (signature, offset = 0) =>
    signature.every((value, index) => bytes[offset + index] === value);
  return type === "image/png"
    ? starts([137, 80, 78, 71, 13, 10, 26, 10])
    : type === "image/jpeg"
      ? starts([255, 216, 255])
      : type === "image/webp"
        ? starts([82, 73, 70, 70]) && starts([87, 69, 66, 80], 8)
        : false;
}

async function verifyLogoFile(file) {
  if (
    !file ||
    !Object.hasOwn(imageTypes, file.type) ||
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > maxLogoBytes ||
    typeof file.arrayBuffer !== "function"
  )
    fail("Choose a PNG, JPEG or WebP company logo under 3 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size || !validImageBytes(file.type, bytes))
    fail("Company logo bytes do not match the selected image format.");
  return imageTypes[file.type];
}

export async function uploadFRTCompanyLogo({
  auth,
  api,
  workspaceId,
  companyCode,
  file,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  baseUrl = SUPABASE_URL,
} = {}) {
  await signedCompanyScope({ auth, api, workspaceId, companyCode });
  if (typeof fetchImpl !== "function")
    fail("Company logo upload is unavailable.", 503);
  const extension = await verifyLogoFile(file);
  if (!globalThis.crypto?.randomUUID)
    fail("Secure company logo identifier is unavailable.", 503);
  const path =
    workspaceId +
    "/company-profiles/" +
    companyCode +
    "/" +
    globalThis.crypto.randomUUID() +
    "." +
    extension;
  await storageRequest({
    auth,
    fetchImpl,
    baseUrl,
    path: "/storage/v1/object/" + bucket + "/" + encodePath(path),
    body: file,
    contentType: file.type,
  });
  return path;
}

export async function deleteFRTCompanyLogo({
  auth,
  api,
  workspaceId,
  companyCode,
  logoPath,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  baseUrl = SUPABASE_URL,
} = {}) {
  const { company } = await signedCompanyScope({
    auth,
    api,
    workspaceId,
    companyCode,
  });
  const prefix = workspaceId + "/company-profiles/" + companyCode + "/";
  if (
    typeof logoPath !== "string" ||
    !logoPath.startsWith(prefix) ||
    !/\.(png|jpg|webp)$/i.test(logoPath)
  )
    fail("Company logo cleanup path is invalid.", 403, "FRT_COMPANY_LOGO_SCOPE_INVALID");
  if (company.logo_path === logoPath)
    fail("A linked company logo cannot be removed during upload cleanup.", 409);
  if (typeof fetchImpl !== "function")
    fail("Company logo cleanup is unavailable.", 503);
  await storageRequest({
    auth,
    fetchImpl,
    baseUrl,
    path: "/storage/v1/object/" + bucket + "/" + encodePath(logoPath),
    method: "DELETE",
    contentType: null,
  });
  return true;
}

export async function saveFRTCompanyProfileWithLogo({
  auth,
  api,
  workspaceId,
  companyCode,
  profile,
  file = null,
  removeLogo = false,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  baseUrl = SUPABASE_URL,
} = {}) {
  let logoPath = removeLogo ? null : profile?.logoPath ?? null;
  let uploadedLogoPath = null;
  let saved;
  try {
    if (file) {
      uploadedLogoPath = await uploadFRTCompanyLogo({
        auth,
        api,
        workspaceId,
        companyCode,
        file,
        fetchImpl,
        baseUrl,
      });
      logoPath = uploadedLogoPath;
    }
    saved = await saveFRTCompanyProfile({
      auth,
      api,
      workspaceId,
      companyCode,
      profile: { ...profile, logoPath },
    });
  } catch (error) {
    if (uploadedLogoPath) {
      try {
        await deleteFRTCompanyLogo({
          auth,
          api,
          workspaceId,
          companyCode,
          logoPath: uploadedLogoPath,
          fetchImpl,
          baseUrl,
        });
      } catch {
        // Preserve the original save error; cleanup is best-effort and scoped
        // to the newly uploaded, still-unlinked object.
      }
    }
    throw error;
  }

  let logoDataUrl = null;
  let logoLoadError = "";
  if (saved.logoPath) {
    try {
      logoDataUrl = await loadFRTCompanyLogoDataUrl({
        auth,
        api,
        workspaceId,
        companyCode,
        logoPath: saved.logoPath,
        fetchImpl,
        baseUrl,
      });
    } catch (error) {
      logoLoadError = error?.message || "Saved company logo preview is unavailable.";
    }
  }
  return { ...saved, logoDataUrl, logoLoadError };
}

export async function loadFRTCompanyLogoDataUrl({
  auth,
  api,
  workspaceId,
  companyCode,
  logoPath,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  baseUrl = SUPABASE_URL,
} = {}) {
  if (!logoPath) return null;
  const { company } = await signedCompanyScope({
    auth,
    api,
    workspaceId,
    companyCode,
  });
  const prefix = workspaceId + "/company-profiles/" + companyCode + "/";
  if (
    company.logo_path !== logoPath ||
    !logoPath.startsWith(prefix) ||
    !/\.(png|jpg|webp)$/i.test(logoPath)
  )
    fail(
      "Company logo is not linked to the selected company.",
      403,
      "FRT_COMPANY_LOGO_SCOPE_INVALID",
    );
  if (typeof fetchImpl !== "function")
    fail("Company logo retrieval is unavailable.", 503);
  const signedResponse = await storageRequest({
    auth,
    fetchImpl,
    baseUrl,
    path: "/storage/v1/object/sign/" + bucket + "/" + encodePath(logoPath),
    body: JSON.stringify({ expiresIn: 120 }),
  });
  const signed = await signedResponse.json().catch(() => null);
  const signedPath = signed?.signedURL || signed?.signedUrl;
  if (typeof signedPath !== "string" || !signedPath)
    fail("Private company logo link is unavailable.", 409);
  const base = new URL(baseUrl);
  let url = new URL(signedPath, baseUrl);
  if (url.origin !== base.origin)
    fail("Company logo link has an unexpected destination.", 403);
  if (url.pathname.startsWith("/object/sign/" + bucket + "/"))
    url = new URL("/storage/v1" + url.pathname + url.search, base);
  if (!url.pathname.startsWith("/storage/v1/object/sign/" + bucket + "/"))
    fail("Company logo link has an unexpected destination.", 403);
  const actor = auth.userId;
  const response = await fetchImpl(url.href, {
    method: "GET",
    mode: "cors",
    redirect: "error",
    cache: "no-store",
    credentials: "omit",
  });
  if (actor !== auth.userId || !auth.isSignedIn)
    fail(
      "Signed identity changed during company logo retrieval.",
      403,
      "FRT_COMPANY_PROFILE_SESSION_CHANGED",
    );
  if (!response.ok)
    throw new ApiError(
      "Company logo download rejected (" + response.status + ").",
      response.status,
    );
  const blob = await response.blob();
  if (blob.size < 1 || blob.size > maxLogoBytes)
    fail("Stored company logo exceeds the supported size.", 409);
  const type = String(
    blob.type || response.headers?.get?.("content-type") || "",
  )
    .split(";")[0]
    .toLowerCase();
  if (!Object.hasOwn(imageTypes, type))
    fail("Stored company logo has an unsupported image type.", 409);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length !== blob.size || !validImageBytes(type, bytes))
    fail("Stored company logo failed image validation.", 409);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return "data:" + type + ";base64," + btoa(binary);
}

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
export function renderFRTCompanyProfileEditor(profile) {
  if (!profile) return '<p role="alert">Company profile is unavailable.</p>';
  const logo = profile.logoDataUrl
    ? '<img src="' +
      escapeHtml(profile.logoDataUrl) +
      '" alt="' +
      escapeHtml(profile.legalName) +
      ' logo">'
    : "<span>No company logo configured</span>";
  return (
    '<form id="frt-company-profile-form" class="frt-company-profile-form" data-frt-company-profile-form>' +
    '<p class="frt-company-profile-intro">Company information is saved on the existing ' +
    escapeHtml(profile.companyCode) +
    " FRT company record and reused by Disbursement Voucher previews and PDFs.</p>" +
    '<div class="frt-company-profile-grid">' +
    '<label class="frt-company-profile-field">Legal company name' +
    '<input id="frt-company-legal-name" name="legalName" maxlength="180" minlength="2" required value="' +
    escapeHtml(profile.legalName) +
    '"></label>' +
    '<label class="frt-company-profile-field">Registered company address' +
    '<textarea id="frt-company-registered-address" name="registeredAddress" maxlength="500" rows="3">' +
    escapeHtml(profile.registeredAddress) +
    "</textarea></label>" +
    '<label class="frt-company-profile-field">Official contact telephone' +
    '<input id="frt-company-contact-phone" name="contactPhone" maxlength="120" type="tel" value="' +
    escapeHtml(profile.contactPhone) +
    '"></label>' +
    '<label class="frt-company-profile-field">Official contact email' +
    '<input id="frt-company-contact-email" name="contactEmail" maxlength="180" type="email" value="' +
    escapeHtml(profile.contactEmail) +
    '"></label>' +
    "</div>" +
    '<section class="frt-company-logo-editor"><div class="frt-company-logo-preview" data-frt-company-logo-preview>' +
    logo +
    "</div>" +
    '<div><label class="frt-company-profile-field">Company logo (PNG, JPEG or WebP; maximum 3 MB)' +
    '<input id="frt-company-logo" name="companyLogo" type="file" accept="image/png,image/jpeg,image/webp"></label>' +
    '<button type="button" class="secondary" data-frt-company-logo-remove>Remove current logo</button></div></section>' +
    '<p class="frt-company-profile-status" data-frt-company-profile-status role="status" aria-live="polite"></p>' +
    '<div class="modal-actions"><button type="submit" class="primary" data-frt-company-profile-save>Save Company Profile</button></div>' +
    "</form>"
  );
}
