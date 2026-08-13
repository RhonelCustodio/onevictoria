import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { firebaseConfig } from "./firebase-config/firebase-config.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  getDocs,
  getDoc,
  getDocFromServer,
  where,
  limit,
  serverTimestamp,
  deleteDoc,
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  sendPasswordResetEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ===== STANDARDIZED STATUS CONSTANTS =====
const STATUS = {
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  REGISTERED: "Registered",
  CANCELLED: "Cancelled",
};

// ===== PAYMENT CONFIGURATION =====
const PAYMENT_CONFIG = {
  gcash: {
    number: "09916744853",
    name: "Municipality of Victoria",
  },
  paymaya: {
    number: "",
    name: "",
  },
  bankTransfer: {
    bankName: "GCash",
    accountNumber: "4413-6000-0859-3972",
    accountName: "Municipality of Victoria",
  },
  cashPayment: {
    officeAddress: "Municipal Hall, Victoria, Tarlac",
    officeHours: "8:00 AM - 5:00 PM, Monday to Friday",
  },
};

// ===== QR CODE CONFIGURATION =====
const QR_CONFIG = {
  baseUrl: "https://api.qrserver.com/v1/create-qr-code/",
};

// ===== GLOBAL STATE =====
let loggedInUser = null,
  alertTimeout = null,
  pendingConfirmCallback = null,
  isSaving = false;
let registeredEventIds = new Set(),
  completedEventIds = new Set();
let eventsUnsubscribe = null,
  participantsUnsubscribe = null,
  notificationsUnsubscribe = null,
  donationsUnsubscribe = null,
  volunteersUnsubscribe = null,
  hoursUnsubscribe = null;
let selectedPaymentMethod = null,
  currentDonationData = null,
  isTabSwitching = false;
let selectedProfilePicFile = undefined,
  selectedSkillVerificationFile = null;
let notificationCount = 0,
  allNotifications = [],
  showingAllNotifications = false;
let mobileShowingAllNotifications = false;
let accountStatusUnsubscribe = null;
let forcedLogoutInProgress = false;
let sessionCheckInterval = null,
  currentSessionToken = null;
let announcementsById = new Map();

// ===== FORGOT PASSWORD FUNCTION =====
/**
 * Handle Forgot Password request using Firebase
 * Sends a password reset email to the user's email address
 */
window.handleForgotPassword = function () {
  // Check if modal already exists, remove it if so
  const existingModal = document.getElementById("forgot-password-modal");
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal overlay
  const overlay = document.createElement("div");
  overlay.id = "forgot-password-modal";
  overlay.className =
    "fixed inset-0 bg-[#070818]/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4";

  // Create modal content
  const modal = document.createElement("div");
  modal.className =
    "glass rounded-2xl max-w-md w-full p-8 border border-white/10 modal-enter relative";
  modal.onclick = function (e) {
    e.stopPropagation();
  };

  // Build modal HTML
  modal.innerHTML = `
    <button type="button" onclick="closeForgotPasswordModal()" 
            class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
      <i class="fa-solid fa-xmark text-xl"></i>
    </button>
    
    <div class="text-center mb-6">
      <div class="w-14 h-14 bg-tsu-blue rounded-full flex items-center justify-center mx-auto mb-3 shadow-md">
        <i class="fa-solid fa-key text-tsu-gold text-xl"></i>
      </div>
      <h2 class="text-2xl font-extrabold text-tsu-blue tracking-tight">Reset Password</h2>
      <p class="text-sm text-gray-500 mt-1">Enter your email address to receive a password reset link</p>
    </div>
    
    <form id="forgot-password-form" class="space-y-4">
      <div>
        <label class="block text-xs font-semibold text-[#C5CBE3] mb-1.5">Email Address</label>
        <div class="relative">
          <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
            <i class="fa-solid fa-envelope text-xs"></i>
          </span>
          <input type="email" id="forgot-email" required 
                 class="w-full pl-9 pr-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-gray-400 focus:border-tsu-gold focus:ring-2 focus:ring-tsu-gold/20 text-sm transition-all"
                 placeholder="example@gmail.com" 
                 autocomplete="email" />
        </div>
        <!-- Error message container inside the modal -->
        <div id="forgot-password-error" class="hidden mt-2 text-xs font-medium text-red-600 flex items-start space-x-2">
          <i class="fa-solid fa-circle-exclamation mt-0.5 text-[10px]"></i>
          <span id="forgot-password-error-text">Error message</span>
        </div>
        <p class="text-[10px] text-gray-400 mt-1">We'll send a reset link to this email</p>
      </div>
      
      <button type="submit" 
              class="w-full bg-tsu-blue hover:bg-tsu-blueDark text-white font-bold py-2.5 rounded-xl text-sm uppercase tracking-wider shadow-lg transition-all flex items-center justify-center space-x-2">
        <i class="fa-solid fa-paper-plane text-xs"></i>
        <span>Send Reset Link</span>
      </button>
    </form>
    
    <div class="text-center mt-4 pt-3 border-t border-gray-100">
      <p class="text-xs text-gray-400">Remember your password? 
        <button type="button" onclick="closeForgotPasswordModal()" 
                class="text-tsu-blue font-semibold hover:underline">
          Back to Sign In
        </button>
      </p>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Prevent body scroll
  document.body.style.overflow = "hidden";

  // Handle form submission
  const form = document.getElementById("forgot-password-form");
  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      const email = document.getElementById("forgot-email")?.value.trim() || "";
      const emailInput = document.getElementById("forgot-email");
      const errorContainer = document.getElementById("forgot-password-error");
      const errorText = document.getElementById("forgot-password-error-text");

      // Reset any previous error styling
      if (emailInput) {
        emailInput.classList.remove("border-red-500", "bg-red-50", "ring-red-500");
        emailInput.classList.add("border-gray-200");
      }
      if (errorContainer) {
        errorContainer.classList.add("hidden");
        errorContainer.classList.remove("flex");
      }

      // Validate email
      if (!email) {
        // Highlight only the border red - no focus
        if (emailInput) {
          emailInput.classList.remove("border-gray-200");
          emailInput.classList.add("border-red-500");
          // Keep the red border until user focuses on the input
        }
        // Show error inside modal only
        if (errorContainer && errorText) {
          errorText.textContent = "Please enter your email address.";
          errorContainer.classList.remove("hidden");
          errorContainer.classList.add("flex");
        }
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        // Highlight only the border red - no focus
        if (emailInput) {
          emailInput.classList.remove("border-gray-200");
          emailInput.classList.add("border-red-500");
          // Keep the red border until user focuses on the input
        }
        // Show error inside modal only
        if (errorContainer && errorText) {
          errorText.textContent = "Please enter a valid email address.";
          errorContainer.classList.remove("hidden");
          errorContainer.classList.add("flex");
        }
        return;
      }

      // Show loading state on button
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i><span>Sending...</span>';

      try {
        // Check if the user exists first
        let userExists = false;
        try {
          // Try to get user by email
          const userQuery = query(
            collection(db, "residents"),
            where("email", "==", email),
            limit(1)
          );
          const querySnapshot = await getDocs(userQuery);
          userExists = !querySnapshot.empty;
        } catch (checkError) {
          console.warn("Error checking user existence:", checkError);
        }

        // If user doesn't exist, throw an error immediately
        if (!userExists) {
          throw { code: "auth/user-not-found" };
        }

        // Send password reset email via Firebase
        await sendPasswordResetEmail(auth, email);

        // Show success message using toast
        window.showAlert(
          "Reset Link Sent!",
          `A password reset link has been sent to ${email}. Please check your inbox and spam folder.`,
          "success",
        );

        // Close modal after success
        setTimeout(() => {
          closeForgotPasswordModal();
        }, 1500);

        console.log(`✅ Password reset email sent to: ${email}`);
      } catch (error) {
        // Highlight only the border red - no focus, no text selection
        if (emailInput) {
          emailInput.classList.remove("border-gray-200");
          emailInput.classList.add("border-red-500");
          // DO NOT focus, DO NOT select text
        }

        // Handle specific Firebase errors
        let errorMessage = "Failed to send reset link. Please try again.";

        switch (error.code) {
          case "auth/user-not-found":
            // User doesn't exist - show clear error message
            errorMessage = "No account exists with this email address. Please check your email or create a new account.";
            break;

          case "auth/invalid-email":
            errorMessage = "Invalid email address format.";
            break;

          case "auth/too-many-requests":
            errorMessage =
              "Too many requests. Please wait a few minutes and try again.";
            break;

          case "auth/network-request-failed":
            errorMessage =
              "Network error. Please check your internet connection.";
            break;

          default:
            errorMessage = `Failed to send reset link: ${error.message}`;
        }

        // Show error inside modal only - NO toast message
        if (errorContainer && errorText) {
          errorText.textContent = errorMessage;
          errorContainer.classList.remove("hidden");
          errorContainer.classList.add("flex");
        }

        console.error("Password reset error:", error);
      } finally {
        // Reset button state
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });

    // Add focus event to remove red border when user focuses on the input
    const emailInput = document.getElementById("forgot-email");
    const errorContainer = document.getElementById("forgot-password-error");
    if (emailInput) {
      // Remove red border and error message when user focuses on the input
      emailInput.addEventListener("focus", function() {
        this.classList.remove("border-red-500");
        this.classList.add("border-gray-200");
        // Hide error message when user focuses on input
        if (errorContainer) {
          errorContainer.classList.add("hidden");
          errorContainer.classList.remove("flex");
        }
      });

      // Also remove red border when user starts typing (backup)
      emailInput.addEventListener("input", function() {
        this.classList.remove("border-red-500");
        this.classList.add("border-gray-200");
        // Hide error message when user starts typing
        if (errorContainer) {
          errorContainer.classList.add("hidden");
          errorContainer.classList.remove("flex");
        }
      });
    }
  }
};

/**
 * Close the forgot password modal
 */
window.closeForgotPasswordModal = function () {
  const modal = document.getElementById("forgot-password-modal");
  if (modal) {
    modal.remove();
    document.body.style.overflow = "";
  }
};

// ===== PASSWORD SYNC ON LOGIN =====
/**
 * Sync the password with Firestore after login
 * This ensures the password in Firestore matches the one in Firebase Auth
 */
// ===== DISABLED ACCOUNT HELPERS =====
// An admin can disable a resident from the admin terminal. That sets
// isDisabled/accountStatus on the resident document.
function isAccountDisabled(data) {
  return (
    data?.isDisabled === true ||
    data?.accountStatus === "Disabled" ||
    // Soft-deleted (archived) accounts are locked out too. The admin can
    // restore them from the Deleted filter in the admin terminal.
    data?.isDeleted === true ||
    data?.accountStatus === "Deleted"
  );
}

// Deleted accounts get a recovery message instead of a ban message.
function accountLockMessage(data) {
  if (data?.isDeleted === true || data?.accountStatus === "Deleted") {
    return "This account has been deleted. If you would like it recovered, please contact the Victoria municipal office and request account recovery.";
  }
  const reason = data?.disabledReason || "Violation of portal rules";
  return `Your account has been disabled by the municipal administrator. Reason: ${reason}. Please visit the Victoria municipal office if you believe this is a mistake.`;
}

// Immediately tear down the session of a resident who was just disabled.
async function forceLogoutDisabled(reasonOrData) {
  // The watcher, the heartbeat and the auth listener can all fire at once.
  // Only the first one should tear the session down and show the alert.
  if (forcedLogoutInProgress) return;
  forcedLogoutInProgress = true;
  try {
    stopSessionHeartbeat();
    if (accountStatusUnsubscribe) {
      accountStatusUnsubscribe();
      accountStatusUnsubscribe = null;
    }
    if (participantsUnsubscribe) participantsUnsubscribe();
    if (notificationsUnsubscribe) notificationsUnsubscribe();
    if (donationsUnsubscribe) donationsUnsubscribe();
    if (volunteersUnsubscribe) volunteersUnsubscribe();
    if (hoursUnsubscribe) hoursUnsubscribe();

    await signOut(auth);
    clearUserSession();
    loggedInUser = null;
    currentSessionToken = null;

    document.getElementById("auth-screen")?.classList.remove("hidden");
    document.getElementById("dashboard")?.classList.add("hidden");
    hideNotificationBell();
    renderPublicEvents();
    hideLoading();

    // Accepts either the resident data object or a plain reason string.
    const data =
      typeof reasonOrData === "object" && reasonOrData !== null
        ? reasonOrData
        : { disabledReason: reasonOrData };
    const deleted =
      data.isDeleted === true || data.accountStatus === "Deleted";

    window.showAlert(
      deleted ? "Account Deleted" : "Account Disabled",
      `${accountLockMessage(data)} You have been signed out.`,
      "error",
    );
  } catch (e) {
    console.error("Force logout failed:", e);
  } finally {
    // Let the auth screen settle before allowing another forced logout.
    setTimeout(() => {
      forcedLogoutInProgress = false;
    }, 3000);
  }
}

// Live watcher: signs the resident out the instant an admin disables them,
// even if their tab is already open.
function watchAccountStatus(uid) {
  if (!uid) return;
  if (accountStatusUnsubscribe) accountStatusUnsubscribe();
  accountStatusUnsubscribe = onSnapshot(
    doc(db, "residents", uid),
    { includeMetadataChanges: false },
    (snap) => {
      // The very first callback can be served from the local cache, which may
      // still hold the pre-deletion copy. Ignore cached frames so we only act
      // on what the server actually says.
      if (snap.metadata.fromCache) return;

      // Document gone entirely = the admin used Permanently Delete. The old
      // code returned here, which is why a hard-deleted resident stayed
      // logged in. Treat a missing profile as an immediate sign-out.
      if (!snap.exists()) {
        forceLogoutDisabled({ accountStatus: "Deleted", isDeleted: true });
        return;
      }

      const data = snap.data();
      if (isAccountDisabled(data)) {
        forceLogoutDisabled(data);
      }
    },
    (err) => {
      // A permission-denied here means the rules cut us off, which in this
      // app only happens once the account is no longer in good standing.
      console.error("Account status watcher error:", err);
      if (err?.code === "permission-denied") {
        forceLogoutDisabled({ accountStatus: "Deleted", isDeleted: true });
      }
    },
  );
}

// syncPasswordOnLogin removed: passwords must never be written to Firestore
// or localStorage. Firebase Authentication is the only password store.

// ===== MOBILE SIDE MENU =====
function openMobileMenu() {
  const menu = document.getElementById("mobile-side-menu");
  const overlay = document.getElementById("mobile-overlay-menu");
  if (menu) {
    menu.classList.add("open");
    document.body.classList.add("menu-open");
  }
  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.classList.add("show");
  }
}
function closeMobileMenu() {
  const menu = document.getElementById("mobile-side-menu");
  const overlay = document.getElementById("mobile-overlay-menu");
  if (menu) {
    menu.classList.remove("open");
    document.body.classList.remove("menu-open");
  }
  if (overlay) {
    overlay.classList.remove("show");
    setTimeout(() => overlay.classList.add("hidden"), 300);
  }
}
window.openMobileMenu = openMobileMenu;
window.closeMobileMenu = closeMobileMenu;

// ===== HEADER DROPDOWN MANAGEMENT =====
function closeAllHeaderDropdowns() {
  document
    .querySelectorAll(".header-dropdown")
    .forEach((d) => d.classList.remove("show"));
}

// ===== DATE UTILITIES =====
function escapeAnnouncementHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getSafeAnnouncementImageUrl(value) {
  const imageUrl = String(value || "").trim();
  if (!imageUrl) return "";

  // Organizer uploads may be original or high-quality optimized image data URLs.
  if (/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(imageUrl)) {
    return imageUrl;
  }

  try {
    const parsed = new URL(imageUrl, window.location.href);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.href
      : "";
  } catch {
    return "";
  }
}

function formatShortDate(ts) {
  if (!ts) return "N/A";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
function formatRelativeTime(ts) {
  if (!ts) return "";
  const now = new Date(),
    date = ts.toDate ? ts.toDate() : new Date(ts);
  const diffMs = now - date,
    diffSec = Math.floor(diffMs / 1000),
    diffMin = Math.floor(diffSec / 60),
    diffHr = Math.floor(diffMin / 60),
    diffDays = Math.floor(diffHr / 24),
    diffWeeks = Math.floor(diffDays / 7),
    diffMonths = Math.floor(diffDays / 30),
    diffYears = Math.floor(diffDays / 365);
  if (diffSec < 60) return "Just now";
  if (diffMin < 60)
    return `${diffMin} ${diffMin === 1 ? "minute" : "minutes"} ago`;
  if (diffHr < 24) return `${diffHr} ${diffHr === 1 ? "hour" : "hours"} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks < 5)
    return `${diffWeeks} ${diffWeeks === 1 ? "week" : "weeks"} ago`;
  if (diffMonths < 12)
    return `${diffMonths} ${diffMonths === 1 ? "month" : "months"} ago`;
  if (diffYears === 1) return "1 year ago";
  return `${diffYears} years ago`;
}
function formatFullDateTime(ts) {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return (
    date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }) +
    " at " +
    date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  );
}
function formatTimeDisplay(timeValue) {
  if (!timeValue) return "";
  if (typeof timeValue === "string" && timeValue.includes(":")) {
    const [hours, minutes] = timeValue.split(":");
    const h = parseInt(hours),
      ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${minutes} ${ampm}`;
  }
  return timeValue;
}

// ===== QR CODE GENERATION FUNCTIONS (NO FIXED AMOUNT - DONOR INPUTS MANUALLY) =====

/**
 * Calculate CRC16 for EMVCo QR standard
 */
function calculateCRC16(data) {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }
  return crc & 0xffff;
}

/**
 * Generate GCash QR Ph format (EMVCo compliant) - NO fixed amount
 * Donor will input amount manually after scanning
 */
function generateGCashQRData() {
  const gcashNumber = PAYMENT_CONFIG.gcash.number.replace(/^0/, "63"); // 09XX -> 639XX
  const merchantName = PAYMENT_CONFIG.gcash.name || "Municipality of Victoria";
  const merchantCity = "Victoria";

  // Build QR Ph string without amount (static QR)
  let qrString = "";

  // Payload Format Indicator
  qrString += "000201";

  // Point of Initiation Method: 0102 = Static QR (user inputs amount)
  qrString += "010212";

  // Merchant Account Information (Tag 28)
  let merchantInfo = "";
  merchantInfo += "0016com.p2pqrpay.gcash"; // GCash GUI
  merchantInfo +=
    "01" + gcashNumber.length.toString().padStart(2, "0") + gcashNumber; // Proxy Type 01 (MSISDN) + number

  qrString +=
    "28" + merchantInfo.length.toString().padStart(2, "0") + merchantInfo;

  // Merchant Category Code (0000 = unspecified)
  qrString += "52040000";

  // Currency (608 = PHP)
  qrString += "5303608";

  // Country Code (PH)
  qrString += "5802PH";

  // Merchant Name
  qrString +=
    "59" + merchantName.length.toString().padStart(2, "0") + merchantName;

  // Merchant City
  qrString +=
    "60" + merchantCity.length.toString().padStart(2, "0") + merchantCity;

  // Postal Code
  qrString += "61042313";

  // Additional Data - Reference Label
  const reference = "Donation";
  // Tag 62 subfield is "05" + 2-digit length + reference => total = 4 + reference.length
  qrString +=
    "62" +
    (4 + reference.length).toString().padStart(2, "0") +
    "05" +
    reference.length.toString().padStart(2, "0") +
    reference;

  // CRC16
  const crc = calculateCRC16(qrString + "6304");
  qrString += "6304" + crc.toString(16).toUpperCase().padStart(4, "0");

  return qrString;
}

/**
 * Alternative simple format for GCash
 */
function generateSimpleGCashQRData() {
  const number = PAYMENT_CONFIG.gcash.number;
  const name = PAYMENT_CONFIG.gcash.name;
  // Simple URI format - no amount, donor inputs manually
  return `GCASH://sendmoney/${number}/${encodeURIComponent(name)}`;
}

function generateBankTransferQRData() {
  return [
    `Bank: ${PAYMENT_CONFIG.bankTransfer.bankName}`,
    `Account: ${PAYMENT_CONFIG.bankTransfer.accountNumber}`,
    `Name: ${PAYMENT_CONFIG.bankTransfer.accountName}`,
  ].join("\n");
}

function generateQRCodeUrl(data) {
  return `${QR_CONFIG.baseUrl}?size=300x300&data=${encodeURIComponent(data)}&bgcolor=ffffff&color=000000&format=png&margin=10`;
}

/**
 * Display QR Code - NO amount parameter
 */
function displayQRCode(method) {
  const ph = document.getElementById("qr-code-placeholder");
  if (!ph) return;

  let qrData = "";
  let label = "";
  let number = "";
  let name = "";
  let instructions = "";

  if (method === "gcash") {
    // Use QR Ph format for GCash compatibility
    qrData = generateGCashQRData();
    label = "Scan with GCash App";
    number = PAYMENT_CONFIG.gcash.number;
    name = PAYMENT_CONFIG.gcash.name;
    instructions = `
      <div class="text-xs text-gray-600 mt-4 p-4 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl border border-blue-200">
        <div class="flex items-start space-x-2 mb-3">
          <div class="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shrink-0 mt-0.5">
            <i class="fa-solid fa-mobile-screen text-white text-[10px]"></i>
          </div>
          <p class="font-bold text-blue-800 text-sm">How to Pay via GCash</p>
        </div>
        <ol class="space-y-2 text-[11px]">
          <li class="flex items-start space-x-2">
            <span class="font-bold text-blue-600">1.</span>
            <span>Open your <span class="font-bold">GCash app</span> on your phone</span>
          </li>
          <li class="flex items-start space-x-2">
            <span class="font-bold text-blue-600">2.</span>
            <span>Tap <span class="font-bold">"Scan QR"</span> to scan the code</span>
          </li>
          <li class="flex items-start space-x-2">
            <span class="font-bold text-blue-600">3.</span>
            <span><span class="font-bold">Enter the amount</span> you wish to donate</span>
          </li>
          <li class="flex items-start space-x-2">
            <span class="font-bold text-blue-600">4.</span>
            <span>Review and <span class="font-bold">confirm payment</span></span>
          </li>
          <li class="flex items-start space-x-2">
            <span class="font-bold text-blue-600">5.</span>
            <span><span class="font-bold">Save screenshot</span> of confirmation</span>
          </li>
        </ol>
        
        <div class="mt-3 p-3 bg-white rounded-lg border border-blue-200">
          <p class="text-[10px] text-gray-500 mb-1 text-center">Or manually send to:</p>
          <div class="flex flex-col items-center space-y-2">
            <div class="flex items-center justify-center space-x-2">
              <i class="fa-solid fa-mobile-screen text-blue-600"></i>
              <span class="font-bold text-gray-800 font-mono text-sm">${number}</span>
            </div>
            <button onclick="window.copyToClipboard('${number}')" 
                    class="text-xs text-blue-600 hover:text-blue-800 px-4 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition-all">
              <i class="fa-solid fa-copy mr-1"></i>Copy Number
            </button>
          </div>
          <p class="text-[10px] text-gray-500 mt-1 text-center">${name}</p>
        </div>
      </div>
    `;
  } else if (method === "paymaya") {
    qrData = generateSimpleGCashQRData(); // Same format works
    label = "Scan with PayMaya App";
    number = PAYMENT_CONFIG.gcash.number;
    name = PAYMENT_CONFIG.gcash.name;
    instructions = `
      <div class="text-xs text-gray-600 mt-4 p-4 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl border border-purple-200">
        <div class="flex items-start space-x-2 mb-3">
          <div class="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center shrink-0 mt-0.5">
            <i class="fa-solid fa-mobile-screen text-white text-[10px]"></i>
          </div>
          <p class="font-bold text-purple-800 text-sm">How to Pay via PayMaya</p>
        </div>
        <ol class="space-y-2 text-[11px]">
          <li class="flex items-start space-x-2">
            <span class="font-bold text-purple-600">1.</span>
            <span>Open your <span class="font-bold">PayMaya app</span></span>
          </li>
          <li class="flex items-start space-x-2">
            <span class="font-bold text-purple-600">2.</span>
            <span>Tap <span class="font-bold">"Scan"</span> to scan QR code</span>
          </li>
          <li class="flex items-start space-x-2">
            <span class="font-bold text-purple-600">3.</span>
            <span>Enter your donation amount</span>
          </li>
          <li class="flex items-start space-x-2">
            <span class="font-bold text-purple-600">4.</span>
            <span>Confirm and send payment</span>
          </li>
        </ol>
      </div>
    `;
  } else if (method === "bank_transfer") {
    qrData = generateBankTransferQRData();
    label = "Bank Transfer";
    instructions = `
      <div class="text-xs text-gray-600 mt-4 p-4 bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl border border-green-200">
        <div class="flex items-start space-x-2 mb-3">
          <div class="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shrink-0 mt-0.5">
            <i class="fa-solid fa-building-columns text-white text-[10px]"></i>
          </div>
          <p class="font-bold text-green-800 text-sm">Bank Transfer Details</p>
        </div>
        <div class="space-y-3">
          <div class="bg-white rounded-lg p-3 border border-green-200">
            <div class="grid grid-cols-2 gap-2 text-[11px]">
              <span class="text-gray-500">Bank:</span>
              <span class="font-bold text-gray-800">${PAYMENT_CONFIG.bankTransfer.bankName}</span>
              <span class="text-gray-500">Account:</span>
              <span class="font-bold text-gray-800 font-mono">${PAYMENT_CONFIG.bankTransfer.accountNumber}</span>
              <span class="text-gray-500">Name:</span>
              <span class="font-bold text-gray-800">${PAYMENT_CONFIG.bankTransfer.accountName}</span>
            </div>
            <button onclick="window.copyToClipboard('${PAYMENT_CONFIG.bankTransfer.accountNumber}')" 
                    class="mt-2 text-xs text-green-600 hover:text-green-800 px-3 py-1.5 rounded-lg border border-green-200 hover:bg-green-50 transition-all w-full">
              <i class="fa-solid fa-copy mr-1"></i>Copy Account Number
            </button>
          </div>
          <p class="text-[10px] text-amber-700 flex items-start space-x-1">
            <i class="fa-solid fa-triangle-exclamation mt-0.5"></i>
            <span>Please include your <span class="font-bold">full name</span> in the transfer reference</span>
          </p>
        </div>
      </div>
    `;
  }

  const qrUrl = generateQRCodeUrl(qrData);

  ph.innerHTML = `
    <div class="qr-container">
      <!-- QR Code Card -->
      <div class="bg-white p-6 rounded-2xl shadow-lg border-2 border-gray-100">
        <!-- Scan Me Badge -->
        <div class="flex justify-center mb-4">
          <div class="bg-tsu-blue text-white px-4 py-1.5 rounded-full text-xs font-bold inline-flex items-center space-x-2">
            <i class="fa-solid fa-qrcode"></i>
            <span>SCAN TO PAY</span>
          </div>
        </div>
        
        <!-- QR Image -->
        <div class="relative flex justify-center">
          <div class="relative inline-block">
            <img src="${qrUrl}" 
                 alt="${label} QR Code" 
                 class="w-56 h-56 mx-auto relative z-10 rounded-lg"
                 onload="this.style.display='block';"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            
            <!-- Error State -->
            <div class="qr-error hidden w-56 h-56 mx-auto flex-col items-center justify-center bg-red-50 rounded-xl border-2 border-red-200">
              <i class="fa-solid fa-triangle-exclamation text-3xl text-red-400 mb-2"></i>
              <p class="text-sm text-red-600 font-medium">Failed to load QR</p>
              <button onclick="displayQRCode('${method}')" 
                      class="text-xs text-red-600 hover:text-red-800 underline mt-1">
                Try Again
              </button>
            </div>
          </div>
        </div>
        
        <!-- Instruction text -->
        <p class="text-center text-xs text-gray-500 mt-4">
          ${label} • <span class="text-gray-400">Amount: <span class="font-bold text-[#C5CBE3]">You will input</span></span>
        </p>
        
        <!-- Action Buttons -->
        <div class="flex gap-2 mt-4">
          <button onclick="window.downloadQRCode('${qrUrl}')" 
                  class="flex-1 text-xs text-tsu-blue hover:text-white hover:bg-tsu-blue px-3 py-2 rounded-lg border border-tsu-blue transition-all">
            <i class="fa-solid fa-download mr-1"></i>Download
          </button>
          <button onclick="window.shareQRCode('${qrUrl}', '${number}')" 
                  class="flex-1 text-xs text-gray-600 hover:text-white hover:bg-gray-600 px-3 py-2 rounded-lg border border-gray-300 transition-all">
            <i class="fa-solid fa-share-nodes mr-1"></i>Share
          </button>
        </div>
      </div>
      
      <!-- Important Note -->
      <div class="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200 text-center">
        <p class="text-[11px] text-amber-800">
          <i class="fa-solid fa-lightbulb mr-1"></i>
          <span class="font-bold">Reminder:</span> After scanning, enter your donation amount in the app
        </p>
      </div>
      
      ${instructions}
    </div>
  `;
}

// ===== Copy to Clipboard =====
window.copyToClipboard = function (text) {
  // Prevent default behavior
  if (window.event) {
    window.event.preventDefault();
    window.event.stopPropagation();
  }

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        window.showAlert("Copied!", "Number copied to clipboard", "success");
      })
      .catch(() => {
        fallbackCopyToClipboard(text);
      });
  } else {
    fallbackCopyToClipboard(text);
  }

  // Return false to prevent form submission or page reload
  return false;
};

function fallbackCopyToClipboard(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-999999px";
  textArea.style.top = "-999999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand("copy");
    window.showAlert("Copied!", "Number copied to clipboard", "success");
  } catch (err) {
    window.showAlert(
      "Error",
      "Failed to copy. Please manually type the number.",
      "error",
    );
  }
  document.body.removeChild(textArea);
}

// Add this to prevent all copy buttons from causing page reload
document.addEventListener("DOMContentLoaded", function () {
  // Use event delegation to handle all copy button clicks
  document.addEventListener("click", function (e) {
    const copyButton = e.target.closest('[onclick*="copyToClipboard"]');
    if (copyButton) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
});

// ===== Download QR Code =====
window.downloadQRCode = function (qrUrl) {
  if (!qrUrl) {
    const qrImg = document.querySelector("#qr-code-placeholder img");
    if (!qrImg || !qrImg.src) {
      window.showAlert("Error", "No QR code to download", "error");
      return;
    }
    qrUrl = qrImg.src;
  }

  showLoading("Downloading QR...");

  const downloadUrl = qrUrl.replace("size=300x300", "size=600x600");

  fetch(downloadUrl)
    .then((response) => response.blob())
    .then((blob) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `GCash-QR-${PAYMENT_CONFIG.gcash.number}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      hideLoading();
      window.showAlert("Downloaded!", "QR code saved as image", "success");
    })
    .catch(() => {
      hideLoading();
      window.open(downloadUrl, "_blank");
      window.showAlert("Opened", "Right-click the QR image to save", "success");
    });
};

// ===== Share QR Code =====
window.shareQRCode = function (qrUrl, number) {
  if (navigator.share) {
    fetch(qrUrl)
      .then((response) => response.blob())
      .then((blob) => {
        const file = new File([blob], "gcash-qr.png", { type: "image/png" });
        const shareData = {
          title: "Scan to Donate",
          text: `Scan this QR code with GCash to donate. Or send to: ${number}`,
          files: [file],
        };
        return navigator.share(shareData);
      })
      .catch(() => {
        navigator
          .share({
            title: "GCash Donation",
            text: `Send your donation to GCash: ${number} (${PAYMENT_CONFIG.gcash.name})`,
          })
          .catch(() => {
            window.showAlert(
              "Share",
              "Right-click QR to save and share manually",
              "info",
            );
          });
      });
  } else {
    const downloadUrl = qrUrl.replace("size=300x300", "size=600x600");
    window.open(downloadUrl, "_blank");
    window.showAlert(
      "QR Opened",
      "Right-click the image to save or share",
      "info",
    );
  }
};

// ===== MOBILE MENU TOGGLE (backward compatible) =====
window.toggleMobileMenu = function () {
  const mobileMenu = document.getElementById("mobile-side-menu");
  if (mobileMenu) {
    mobileMenu.classList.contains("open")
      ? closeMobileMenu()
      : openMobileMenu();
    return;
  }
  const sidebar = document.getElementById("sidebar"),
    overlay = document.getElementById("mobile-overlay"),
    body = document.body;
  if (!sidebar) return;
  const isOpen = sidebar.classList.contains("translate-x-0");
  if (isOpen) {
    sidebar.classList.remove("translate-x-0");
    sidebar.classList.add("-translate-x-full");
    if (overlay) overlay.classList.add("hidden");
    body.style.overflow = "";
  } else {
    sidebar.classList.remove("-translate-x-full");
    sidebar.classList.add("translate-x-0");
    if (overlay) overlay.classList.remove("hidden");
    body.style.overflow = "hidden";
  }
};

// ===== NOTIFICATION DETAIL OVERLAY =====
window.openNotificationDetail = function (notifId, type, title, message, time) {
  const overlay = document.getElementById("notification-detail-modal");
  if (!overlay) return;
  document.getElementById("notif-detail-title").textContent =
    title || "Notification";
  document.getElementById("notif-detail-time").innerHTML =
    `<i class="fa-solid fa-clock mr-1"></i>${time || "Just now"}`;
  document.getElementById("notif-detail-message").textContent = message || "";
  const iconContainer = document.getElementById("notif-detail-icon");
  const iconInner = document.getElementById("notif-detail-icon-inner");
  let bgClass = "bg-blue-100",
    iconClass = "fa-bell text-blue-600";
  switch (type) {
    case "volunteer_approved":
      bgClass = "bg-emerald-100";
      iconClass = "fa-circle-check text-emerald-600";
      break;
    case "volunteer_rejected":
      bgClass = "bg-rose-100";
      iconClass = "fa-circle-xmark text-rose-600";
      break;
    case "donation_confirmed":
      bgClass = "bg-emerald-100";
      iconClass = "fa-circle-check text-emerald-600";
      break;
    case "donation_rejected":
      bgClass = "bg-rose-100";
      iconClass = "fa-circle-xmark text-rose-600";
      break;
    case "hours_credited":
      bgClass = "bg-purple-100";
      iconClass = "fa-clock text-purple-600";
      break;
    case "contact_status_update":
    case "feedback_status":
      bgClass = "bg-indigo-100";
      iconClass = "fa-envelope-circle-check text-indigo-600";
      break;
  }
  iconContainer.className = `w-12 h-12 rounded-full flex items-center justify-center shadow-md ${bgClass}`;
  iconInner.className = `fa-solid ${iconClass} text-lg`;
  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
};
window.closeNotificationDetail = function () {
  const modal = document.getElementById("notification-detail-modal");
  if (modal) {
    modal.classList.add("hidden");
    document.body.style.overflow = "";
  }
};

// ===== CLEAR ALL NOTIFICATIONS =====
window.clearAllNotifications = async function () {
  if (!loggedInUser?.id) {
    window.showAlert("Error", "Please login first.", "error");
    return;
  }

  showLoading("Clearing notifications...");
  try {
    const snap = await getDocs(
      query(
        collection(db, "notifications"),
        where("residentId", "==", loggedInUser.id),
      ),
    );

    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.forEach((d) => {
        batch.delete(d.ref);
      });
      await batch.commit();
      console.log("✅ All notifications deleted from Firebase");
    }

    allNotifications = [];
    notificationCount = 0;
    updateNotificationBadge();
    renderNotificationDropdown();
    renderMobileNotificationDropdown();

    hideLoading();
    window.showAlert(
      "Notifications Cleared",
      "All notifications have been permanently removed.",
      "success",
    );
  } catch (e) {
    hideLoading();
    console.error("Error clearing notifications:", e);
    window.showAlert("Error", "Failed to clear notifications.", "error");
  }
};

// ===== PAYMENT PROCESSING =====
window.selectPaymentMethod = function (method) {
  selectedPaymentMethod = method;
  const inp = document.getElementById("selected-payment-method");
  if (inp) inp.value = method;

  document
    .querySelectorAll(".payment-method-btn")
    .forEach((b) => b.classList.remove("selected"));
  const btn = document.querySelector(`[data-method="${method}"]`);
  if (btn) btn.classList.add("selected");

  const qr = document.getElementById("qr-code-container");
  const amountSection = document.getElementById("payment-amount-section");
  const screenshotSection = document.getElementById("payment-screenshot-section");

  // Always hide QR code when selecting payment method
  if (qr) {
    qr.classList.add("hidden");
    const placeholder = document.getElementById("qr-code-placeholder");
    if (placeholder) placeholder.innerHTML = "";
  }

  // Hide screenshot section
  if (screenshotSection) screenshotSection.classList.add("hidden");

  // Hide cash password verification section
  const pwdSection = document.getElementById("payment-password-section");
  if (pwdSection) pwdSection.classList.add("hidden");

  // Show the Pay Now button again when user changes payment method
  const payButton = document.getElementById("payment-submit-btn");
  if (payButton) payButton.classList.remove("hidden");
  // Hide the "Confirm Payment" (screenshot) button while choosing a method
  const screenshotBtn = document.getElementById("payment-submit-screenshot-btn");
  if (screenshotBtn) screenshotBtn.classList.add("hidden");
  // Hide the cash "Confirm Cash Payment" button while choosing a method
  const cashBtn = document.getElementById("payment-cash-confirm-btn");
  if (cashBtn) cashBtn.classList.add("hidden");

  // Always hide amount section since amount is already set in donation interface
  if (amountSection) amountSection.classList.add("hidden");

  if (method === "gcash" || method === "paymaya" || method === "bank_transfer") {
    window._isQRPaymentMethod = true;
  } else if (method === "cash") {
    window._isQRPaymentMethod = false;
  }
};

window.setAmount = function (amount) {
  const inp = document.getElementById("donation-amount");
  if (inp) inp.value = amount;
};

window.openPaymentModal = function (item, purpose, donationType = "money", amount = 0) {
  if (!loggedInUser) {
    window.showAlert("Error", "Please login first.", "error");
    return;
  }
  currentDonationData = {
    item: item || "Donation",
    purpose: purpose || "General",
    donorName: loggedInUser.name || "Anonymous",
    donorId: loggedInUser.id || "",
    donationType: donationType,
    amount: amount,
  };
  const pi = document.getElementById("payment-item");
  if (pi) pi.textContent = currentDonationData.item;
  const pp = document.getElementById("payment-purpose");
  if (pp) pp.textContent = currentDonationData.purpose;

  // Display the amount in the payment summary
  const pa = document.getElementById("payment-amount");
  if (pa) {
    if (amount > 0) {
      pa.textContent = `₱${amount.toLocaleString()}`;
    } else {
      pa.textContent = "Amount not specified";
    }
  }

  const pdn = document.getElementById("payment-donor-name");
  if (pdn) pdn.value = currentDonationData.donorName;

  selectedPaymentMethod = null;
  const spm = document.getElementById("selected-payment-method");
  if (spm) spm.value = "";

  document
    .querySelectorAll(".payment-method-btn")
    .forEach((b) => b.classList.remove("selected"));

  const qr = document.getElementById("qr-code-container");
  if (qr) {
    qr.classList.add("hidden");
    const placeholder = document.getElementById("qr-code-placeholder");
    if (placeholder) placeholder.innerHTML = "";
  }

  // Hide screenshot section
  const screenshotSection = document.getElementById("payment-screenshot-section");
  if (screenshotSection) {
    screenshotSection.classList.add("hidden");
    const fileInput = document.getElementById("payment-screenshot-input");
    if (fileInput) fileInput.value = "";
    const preview = document.getElementById("payment-screenshot-preview");
    if (preview) preview.src = "";
    const container = document.getElementById("payment-screenshot-preview-container");
    if (container) container.classList.add("hidden");
  }
  window._paymentScreenshotFile = null;

  // Show the Pay Now button
  const payButton = document.getElementById("payment-submit-btn");
  if (payButton) payButton.classList.remove("hidden");
  // Hide the "Confirm Payment" button while the modal opens
  const screenshotBtn = document.getElementById("payment-submit-screenshot-btn");
  if (screenshotBtn) screenshotBtn.classList.add("hidden");

  // Hide the cash password verification section and its confirm button
  const pwdSection = document.getElementById("payment-password-section");
  if (pwdSection) pwdSection.classList.add("hidden");
  const cashBtn = document.getElementById("payment-cash-confirm-btn");
  if (cashBtn) cashBtn.classList.add("hidden");
  const pwdInput = document.getElementById("payment-password");
  if (pwdInput) pwdInput.value = "";

  // Always hide the amount input section since amount is already set in donation interface
  const amountSection = document.getElementById("payment-amount-section");
  if (amountSection) amountSection.classList.add("hidden");

  // Reset QR payment flag
  window._isQRPaymentMethod = false;

  window.toggleModal("payment-modal");
};

/**
 * Handle payment screenshot upload
 */
window.handlePaymentScreenshotUpload = function (event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) {
    window.showAlert("Error", "Please upload an image file (JPG, PNG, GIF, WEBP).", "error");
    event.target.value = "";
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    window.showAlert("Error", "File size must be less than 5MB.", "error");
    event.target.value = "";
    return;
  }

  window._paymentScreenshotFile = file;

  const reader = new FileReader();
  reader.onload = function (e) {
    const preview = document.getElementById("payment-screenshot-preview");
    const container = document.getElementById("payment-screenshot-preview-container");
    if (preview) preview.src = e.target.result;
    if (container) container.classList.remove("hidden");

    // Show the "Confirm Payment" button only after a screenshot is uploaded
    const screenshotBtn = document.getElementById("payment-submit-screenshot-btn");
    if (screenshotBtn) screenshotBtn.classList.remove("hidden");
  };
  reader.readAsDataURL(file);

  window.showAlert("Screenshot Uploaded!", "Your payment screenshot has been uploaded successfully. Click Confirm Payment to submit.", "success");
};

/**
 * Remove payment screenshot
 */
window.removePaymentScreenshot = function () {
  window._paymentScreenshotFile = null;
  const fileInput = document.getElementById("payment-screenshot-input");
  if (fileInput) fileInput.value = "";
  const preview = document.getElementById("payment-screenshot-preview");
  if (preview) preview.src = "";
  const container = document.getElementById("payment-screenshot-preview-container");
  if (container) container.classList.add("hidden");

  // Hide the "Confirm Payment" button again since the screenshot was removed
  const screenshotBtn = document.getElementById("payment-submit-screenshot-btn");
  if (screenshotBtn) screenshotBtn.classList.add("hidden");
};

async function saveDonation(pr) {
  try {
    if (!pr || !pr.transactionId) throw new Error("Invalid payment result");
    if (!currentDonationData || !currentDonationData.donorId)
      throw new Error("Donation data missing");
    const dd = {
      donorName: currentDonationData.donorName || "Anonymous",
      donorId: currentDonationData.donorId || "",
      donationType: currentDonationData.donationType || "money",
      item: currentDonationData.item || "Donation",
      purpose: currentDonationData.purpose || "General",
      amount: pr.amount || 0,
      paymentMethod: pr.method || "unknown",
      transactionId: pr.transactionId,
      paymentStatus: pr.status || STATUS.PENDING,
      paymentTimestamp: pr.timestamp || new Date().toISOString(),
      status: pr.status || STATUS.PENDING,
      createdAt: serverTimestamp(),
    };
    if (pr.bankDetails)
      dd.bankDetails = {
        bankName: pr.bankDetails.bankName || "",
        accountNumber: pr.bankDetails.accountNumber || "",
        accountName: pr.bankDetails.accountName || "",
      };
    if (pr.cashDetails)
      dd.cashDetails = {
        officeAddress: pr.cashDetails.officeAddress || "",
        officeHours: pr.cashDetails.officeHours || "",
      };
    if (pr.receiverNumber) dd.receiverNumber = pr.receiverNumber;
    if (pr.receiverName) dd.receiverName = pr.receiverName;
    if (pr.screenshot) dd.paymentScreenshot = pr.screenshot;
    await addDoc(collection(db, "donations"), dd);
  } catch (e) {
    console.error("Save donation error:", e);
    throw new Error("Failed to save donation: " + e.message);
  }
}

/**
 * Process payment (first step: show QR + screenshot section for e-wallet / bank)
 */
window.processPayment = async function () {
  const pm =
    selectedPaymentMethod ||
    document.getElementById("selected-payment-method")?.value;
  const donorName =
    document.getElementById("payment-donor-name")?.value?.trim() || "";

  if (!pm) {
    window.showAlert("Error", "Select a payment method.", "error");
    return;
  }

  const isQRPayment = pm === "gcash" || pm === "paymaya" || pm === "bank_transfer";

  if (!donorName) {
    window.showAlert("Error", "Please enter your name.", "error");
    return;
  }

  if (!currentDonationData) {
    window.showAlert("Error", "Donation data missing.", "error");
    return;
  }

  currentDonationData.donorName = donorName;

  if (isQRPayment) {
    // For QR payments, generate and display QR code
    const qr = document.getElementById("qr-code-container");
    if (qr) {
      qr.classList.remove("hidden");
      displayQRCode(pm);
    }

    // Show the screenshot upload section
    const screenshotSection = document.getElementById("payment-screenshot-section");
    if (screenshotSection) screenshotSection.classList.remove("hidden");

    // On mobile the upload box sits below the QR and below the fold.
    // Scroll it into view once the QR image finishes loading (fallback timer too).
    const scrollToUpload = () => {
      if (window.innerWidth < 768 && screenshotSection) {
        screenshotSection.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
    const qrImg = document.querySelector("#qr-code-container img");
    if (qrImg) {
      qrImg.addEventListener("load", scrollToUpload);
    }
    setTimeout(scrollToUpload, 450);

    // Hide the Pay Now button
    const payButton = document.getElementById("payment-submit-btn");
    if (payButton) payButton.classList.add("hidden");

    // Hide the "Confirm Payment" button until a screenshot is uploaded
    const screenshotBtn = document.getElementById("payment-submit-screenshot-btn");
    if (screenshotBtn) screenshotBtn.classList.add("hidden");

    // Update the amount display - use the amount from donation data
    const pa = document.getElementById("payment-amount");
    if (pa) {
      if (currentDonationData.amount > 0) {
        pa.textContent = `₱${currentDonationData.amount.toLocaleString()}`;
      } else {
        pa.textContent = "Amount not specified";
      }
    }

    window.showAlert(
      "QR Code Ready!",
      "Scan the QR code with your GCash/PayMaya app to complete payment. Then upload the screenshot of your successful payment below.",
      "info"
    );
  } else {
    // For cash payment: require account password confirmation before submitting
    const payButton = document.getElementById("payment-submit-btn");
    if (payButton) payButton.classList.add("hidden");

    // Hide the screenshot confirm button (not used for cash)
    const screenshotBtn = document.getElementById("payment-submit-screenshot-btn");
    if (screenshotBtn) screenshotBtn.classList.add("hidden");

    // Show the password verification section
    const pwdSection = document.getElementById("payment-password-section");
    if (pwdSection) {
      pwdSection.classList.remove("hidden");
      pwdSection.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // Show the "Confirm Cash Payment" button
    const cashBtn = document.getElementById("payment-cash-confirm-btn");
    if (cashBtn) cashBtn.classList.remove("hidden");

    // Update the amount display
    const pa = document.getElementById("payment-amount");
    if (pa) {
      if (currentDonationData.amount > 0) {
        pa.textContent = `₱${currentDonationData.amount.toLocaleString()}`;
      } else {
        pa.textContent = "Amount not specified";
      }
    }

    // Focus the password field
    const pwdInput = document.getElementById("payment-password");
    if (pwdInput) pwdInput.focus();
  }
};

/**
 * Confirm a cash payment after verifying the account password
 */
window.confirmCashPayment = async function () {
  const pm =
    selectedPaymentMethod ||
    document.getElementById("selected-payment-method")?.value;
  const donorName =
    document.getElementById("payment-donor-name")?.value?.trim() || "";
  const passwordInput = document.getElementById("payment-password");
  const password = passwordInput?.value || "";

  if (pm !== "cash") {
    window.showAlert("Error", "Cash payment not selected.", "error");
    return;
  }
  if (!donorName) {
    window.showAlert("Error", "Please enter your name.", "error");
    return;
  }
  if (!password) {
    window.showAlert("Error", "Please enter your account password.", "error");
    return;
  }
  if (!currentDonationData) {
    window.showAlert("Error", "Donation data missing.", "error");
    return;
  }
  if (!auth.currentUser) {
    window.showAlert("Error", "You must be logged in.", "error");
    return;
  }

  showLoading("Verifying password...");
  try {
    // Re-authenticate the user to verify the password
    const credential = EmailAuthProvider.credential(
      auth.currentUser.email,
      password
    );
    await reauthenticateWithCredential(auth.currentUser, credential);
  } catch (err) {
    hideLoading();
    window.showAlert(
      "Incorrect Password",
      "The password you entered is incorrect. Please try again.",
      "error"
    );
    if (passwordInput) {
      passwordInput.value = "";
      passwordInput.focus();
    }
    return;
  }

  showLoading("Processing payment...");
  try {
    const paymentAmount = currentDonationData.amount || 0;
    const pr = await processCashPayment(paymentAmount);
    await saveDonation(pr);

    window.toggleModal("payment-modal");
    document.getElementById("donation-money-form")?.reset();
    document.getElementById("payment-form")?.reset();
    currentDonationData = null;
    selectedPaymentMethod = null;
    hideLoading();

    let successMsg = `Amount: ₱${paymentAmount.toLocaleString()}\n`;
    successMsg += `Method: ${pm.replace("_", " ").toUpperCase()}\n`;
    successMsg += `Reference: ${pr.transactionId}\n\n`;
    successMsg += "Please complete your payment at the municipal hall.";

    window.showAlert("Donation Initiated!", successMsg, "success");
  } catch (e) {
    hideLoading();
    window.showAlert("Payment Failed", e.message || "An error occurred.", "error");
  }
};

/**
 * Submit payment with screenshot (final step for e-wallet / bank)
 */
window.submitPaymentWithScreenshot = async function () {
  const pm =
    selectedPaymentMethod ||
    document.getElementById("selected-payment-method")?.value;
  const donorName =
    document.getElementById("payment-donor-name")?.value?.trim() || "";
  const screenshotFile = window._paymentScreenshotFile;

  if (!pm) {
    window.showAlert("Error", "Payment method not selected.", "error");
    return;
  }
  if (!donorName) {
    window.showAlert("Error", "Please enter your name.", "error");
    return;
  }
  if (!screenshotFile) {
    window.showAlert("Error", "Please upload a screenshot of your successful payment.", "error");
    return;
  }
  if (!currentDonationData) {
    window.showAlert("Error", "Donation data missing.", "error");
    return;
  }

  currentDonationData.donorName = donorName;

  showLoading("Submitting payment...");

  try {
    const screenshotBase64 = await convertFileToBase64(screenshotFile);

    const transactionId = `${pm.toUpperCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const paymentAmount = currentDonationData.amount || 0;

    let pr;
    switch (pm) {
      case "gcash":
        pr = await processGCashPayment(paymentAmount);
        break;
      case "paymaya":
        pr = await processPayMayaPayment(paymentAmount);
        break;
      case "bank_transfer":
        pr = await processBankTransfer(paymentAmount);
        break;
      default:
        throw new Error("Invalid payment method");
    }

    pr.transactionId = transactionId;
    pr.status = STATUS.PENDING;
    pr.screenshot = screenshotBase64;

    await saveDonation(pr);

    window.toggleModal("payment-modal");
    document.getElementById("donation-money-form")?.reset();
    document.getElementById("payment-form")?.reset();
    currentDonationData = null;
    selectedPaymentMethod = null;
    window._paymentScreenshotFile = null;

    hideLoading();

    let successMsg = `Method: ${pm.replace("_", " ").toUpperCase()}\n`;
    successMsg += `Reference: ${transactionId}\n\n`;
    if (paymentAmount > 0) {
      successMsg = `Amount: ₱${paymentAmount.toLocaleString()}\n` + successMsg;
    } else {
      successMsg = "Amount: User will input in app\n" + successMsg;
    }
    successMsg += "Your payment has been submitted for verification. Please wait for admin confirmation.";

    window.showAlert("Payment Submitted!", successMsg, "success");
  } catch (e) {
    hideLoading();
    window.showAlert("Payment Failed", e.message || "An error occurred.", "error");
  }
};

async function processGCashPayment(amount) {
  return {
    transactionId: `GCASH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    method: "gcash",
    amount: amount || 0,
    status: STATUS.PENDING,
    timestamp: new Date().toISOString(),
    receiverNumber: PAYMENT_CONFIG.gcash.number,
    receiverName: PAYMENT_CONFIG.gcash.name,
  };
}

async function processPayMayaPayment(amount) {
  return {
    transactionId: `MAYA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    method: "paymaya",
    amount: amount || 0,
    status: STATUS.PENDING,
    timestamp: new Date().toISOString(),
  };
}

async function processBankTransfer(amount) {
  return {
    transactionId: `BANK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    method: "bank_transfer",
    amount: amount || 0,
    status: STATUS.PENDING,
    bankDetails: PAYMENT_CONFIG.bankTransfer,
    timestamp: new Date().toISOString(),
  };
}

async function processCashPayment(amount) {
  return {
    transactionId: `CASH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    method: "cash",
    amount: amount,
    status: STATUS.PENDING,
    cashDetails: PAYMENT_CONFIG.cashPayment,
    timestamp: new Date().toISOString(),
  };
}

// ===== SESSION MANAGEMENT =====
function generateSessionToken() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`;
}

async function enforceSingleSession(uid) {
  if (!uid) return true;
  try {
    const userDoc = await getDoc(doc(db, "residents", uid));
    if (!userDoc.exists()) return true;
    const userData = userDoc.data(),
      storedToken = userData.sessionToken;
    if (storedToken && storedToken !== currentSessionToken) {
      const lastActive = userData.lastActive?.toDate
        ? userData.lastActive.toDate()
        : new Date(0);
      if (lastActive > new Date(Date.now() - 5 * 60 * 1000)) {
        window.showAlert(
          "Session Terminated",
          "This account is already logged in on another device.",
          "error",
        );
        await signOut(auth);
        clearUserSession();
        loggedInUser = null;
        document.getElementById("auth-screen")?.classList.remove("hidden");
        document.getElementById("dashboard")?.classList.add("hidden");
        hideNotificationBell();
        try {
          await updateDoc(doc(db, "residents", uid), {
            sessionToken: null,
            isOnline: false,
          });
        } catch (e) {}
        return false;
      }
    }
    currentSessionToken = generateSessionToken();
    await updateDoc(doc(db, "residents", uid), {
      sessionToken: currentSessionToken,
      lastActive: serverTimestamp(),
      isOnline: true,
      lastDeviceCheck: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error("Session enforcement error:", error);
    return true;
  }
}

function startSessionHeartbeat(uid) {
  if (sessionCheckInterval) clearInterval(sessionCheckInterval);
  sessionCheckInterval = setInterval(async () => {
    if (!loggedInUser?.id) {
      clearInterval(sessionCheckInterval);
      return;
    }
    try {
      const userDoc = await getDoc(doc(db, "residents", uid));
      // Safety net in case the live watcher was never started or was dropped.
      // A missing document means the admin permanently deleted the account.
      if (!userDoc.exists()) {
        clearInterval(sessionCheckInterval);
        await forceLogoutDisabled({
          accountStatus: "Deleted",
          isDeleted: true,
        });
        return;
      }
      if (isAccountDisabled(userDoc.data())) {
        clearInterval(sessionCheckInterval);
        await forceLogoutDisabled(userDoc.data());
        return;
      }
      if (
        userDoc.data().sessionToken &&
        userDoc.data().sessionToken !== currentSessionToken
      ) {
        clearInterval(sessionCheckInterval);
        window.showAlert(
          "Session Expired",
          "Logged in from another device.",
          "error",
        );
        await signOut(auth);
        clearUserSession();
        loggedInUser = null;
        document.getElementById("auth-screen")?.classList.remove("hidden");
        document.getElementById("dashboard")?.classList.add("hidden");
        hideNotificationBell();
        if (participantsUnsubscribe) participantsUnsubscribe();
        if (notificationsUnsubscribe) notificationsUnsubscribe();
        if (donationsUnsubscribe) donationsUnsubscribe();
        if (volunteersUnsubscribe) volunteersUnsubscribe();
        if (hoursUnsubscribe) hoursUnsubscribe();
        return;
      }
      await updateDoc(doc(db, "residents", uid), {
        lastActive: serverTimestamp(),
      });
    } catch (error) {
      console.error("Heartbeat error:", error);
    }
  }, 30000);
}

function stopSessionHeartbeat() {
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
    sessionCheckInterval = null;
  }
}

function saveUserSession(ud) {
  try {
    const sd = {
      ...ud,
      createdAt: ud.createdAt?.toDate
        ? ud.createdAt.toDate().toISOString()
        : ud.createdAt,
      lastActive: ud.lastActive?.toDate
        ? ud.lastActive.toDate().toISOString()
        : ud.lastActive,
    };
    // SECURITY: never persist credentials in localStorage
    delete sd.password;
    localStorage.setItem("barangayUser", JSON.stringify(sd));
  } catch (e) {}
}

function clearUserSession() {
  try {
    localStorage.removeItem("barangayUser");
    sessionStorage.removeItem("userActiveTab");
    sessionStorage.removeItem("registeredEvents");
    sessionStorage.removeItem("completedEvents");
  } catch (e) {}
}

function saveActiveTab(t) {
  try {
    sessionStorage.setItem("userActiveTab", t);
  } catch (e) {}
}

function getSavedActiveTab() {
  try {
    return sessionStorage.getItem("userActiveTab") || "announcements";
  } catch (e) {
    return "announcements";
  }
}

// ===== LOADING MANAGEMENT =====
function showLoading(msg = "Loading...") {
  const l = document.getElementById("global-loading"),
    t = document.getElementById("loading-text");
  if (l) {
    l.classList.remove("hidden");
    l.style.display = "flex";
  }
  if (t) t.textContent = msg;
}

function hideLoading() {
  const l = document.getElementById("global-loading");
  if (l) {
    l.classList.add("hidden");
    l.style.display = "none";
  }
}

// ===== PROFILE PICTURE HANDLING =====
window.triggerProfilePicUpload = function () {
  const fi = document.getElementById("profile-pic-input");
  if (fi) fi.click();
};

window.handleProfilePicChange = function (event) {
  const file = event.target.files[0];
  if (!file) return;
  if (
    !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)
  ) {
    window.showAlert("Error", "Invalid image type.", "error");
    event.target.value = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    window.showAlert("Error", "Image must be < 5MB.", "error");
    event.target.value = "";
    return;
  }
  selectedProfilePicFile = file;
  const reader = new FileReader();
  reader.onload = function (e) {
    const ip = document.getElementById("profile-img-preview"),
      ic = document.getElementById("profile-icon-fallback");
    if (ip) {
      ip.src = e.target.result;
      ip.classList.remove("hidden");
      ip.style.opacity = "0.6";
      ip.style.border = "2px solid #F2A900";
    }
    if (ic) ic.classList.add("hidden");
    const pi = document.getElementById("profile-pic-pending");
    if (pi) pi.classList.remove("hidden");
    const ab = document.getElementById("profile-action-btn");
    if (ab && ab.getAttribute("data-mode") === "save") {
      const rb = document.getElementById("remove-profile-pic-btn");
      if (rb) rb.classList.remove("hidden");
    }
  };
  reader.readAsDataURL(file);
  window.showAlert(
    "Picture Selected",
    "Click 'Save Changes' to apply.",
    "success",
  );
};

window.removeProfilePic = function () {
  const ab = document.getElementById("profile-action-btn");
  if (!ab || ab.getAttribute("data-mode") !== "save") return;
  if (
    !(loggedInUser?.profilePic && loggedInUser.profilePic !== "") &&
    !(selectedProfilePicFile instanceof File)
  ) {
    window.showAlert("No Picture", "Nothing to remove.", "error");
    return;
  }
  window.showConfirmPopup("Remove Picture?", "Are you sure?", () => {
    showLoading("Removing...");
    setTimeout(() => {
      selectedProfilePicFile = null;
      const ip = document.getElementById("profile-img-preview"),
        ic = document.getElementById("profile-icon-fallback");
      if (ip) {
        ip.src = "";
        ip.classList.add("hidden");
        ip.style.opacity = "1";
        ip.style.border = "3px solid rgba(10,41,71,0.15)";
      }
      if (ic) ic.classList.remove("hidden");
      const rb = document.getElementById("remove-profile-pic-btn");
      if (rb) rb.classList.add("hidden");
      const pi = document.getElementById("profile-pic-pending");
      if (pi) pi.classList.remove("hidden");
      const fi = document.getElementById("profile-pic-input");
      if (fi) fi.value = "";
      hideLoading();
      window.showAlert(
        "Marked for Removal",
        "Click 'Save Changes' to apply.",
        "success",
      );
    }, 600);
  });
};

async function uploadProfilePicture(uid, file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function (e) {
      try {
        const b64 = e.target.result;
        await updateDoc(doc(db, "residents", uid), { profilePic: b64 });
        resolve(b64);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===== UI UTILITIES =====
function updateUIWithUserData(user) {
  if (!user) return;
  const ssv = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
  };
  const sst = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || "";
  };
  const ip = document.getElementById("profile-img-preview"),
    ic = document.getElementById("profile-icon-fallback");
  const sp = document.getElementById("sidebar-profile-pic"),
    si = document.getElementById("sidebar-icon-fallback");
  const msp = document.getElementById("mobile-sidebar-profile-pic"),
    msi = document.getElementById("mobile-sidebar-icon-fallback");
  const rb = document.getElementById("remove-profile-pic-btn"),
    pi = document.getElementById("profile-pic-pending");
  if (user.profilePic && user.profilePic !== "") {
    if (ip) {
      ip.src = user.profilePic;
      ip.classList.remove("hidden");
      ip.style.opacity = "1";
      ip.style.border = "3px solid rgba(10,41,71,0.15)";
    }
    if (ic) ic.classList.add("hidden");
    if (sp) {
      sp.src = user.profilePic;
      sp.classList.remove("hidden");
      sp.style.opacity = "1";
    }
    if (si) si.classList.add("hidden");
    if (msp) {
      msp.src = user.profilePic;
      msp.classList.remove("hidden");
      msp.style.opacity = "1";
    }
    if (msi) msi.classList.add("hidden");
  } else {
    if (ip) {
      ip.src = "";
      ip.classList.add("hidden");
      ip.style.opacity = "1";
    }
    if (ic) ic.classList.remove("hidden");
    if (sp) {
      sp.src = "";
      sp.classList.add("hidden");
    }
    if (si) si.classList.remove("hidden");
    if (msp) {
      msp.src = "";
      msp.classList.add("hidden");
    }
    if (msi) msi.classList.remove("hidden");
  }
  if (rb) rb.classList.add("hidden");
  if (pi) pi.classList.add("hidden");
  sst("sidebar-username", user.name || "Resident");
  sst("sidebar-email", user.email || "");
  sst("profile-display-name", user.name || "Resident");
  sst("profile-display-email", user.email || "");
  sst("mobile-username", user.name || "Resident");
  ssv("prof-name", user.name);
  ssv("prof-email", user.email);
  ssv("prof-phone", user.phone);
  ssv("prof-age", user.age);
  ssv("prof-gender", user.gender || "Male");
  ssv("prof-address", user.address);
  ssv("vol-name", user.name);
  ["prof-email", "prof-gender", "prof-name", "prof-age"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = true;
      el.classList.add("bg-gray-100", "cursor-not-allowed");
    }
  });
  const pf = document.getElementById("prof-password");
  if (pf) pf.value = ""; // never prefill the password field
  const fi = document.getElementById("profile-pic-input");
  if (fi) fi.value = "";
}

// ===== MOBILE INPUT RESTRICTIONS =====
function setupPhoneRestrictions() {
  ["reg-phone", "prof-phone"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.setAttribute("maxlength", "11");
      el.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/\D/g, "");
        if (e.target.value.length > 11)
          e.target.value = e.target.value.slice(0, 11);
      });
    }
  });
}

// ===== ALERT SYSTEM =====
window.showAlert = function (title, message, type = "success") {
  const ae = document.getElementById("custom-alert");
  if (!ae) {
    alert(`${title}\n${message}`);
    return;
  }
  clearTimeout(alertTimeout);
  const ib = document.getElementById("alert-icon-box"),
    ic = document.getElementById("alert-icon");
  if (type === "success") {
    if (ib) ib.className = "p-1.5 rounded-lg text-white bg-emerald-500";
    if (ic) ic.className = "fa-solid fa-circle-check text-sm";
  } else if (type === "warning") {
    if (ib) ib.className = "p-1.5 rounded-lg text-white bg-amber-500";
    if (ic) ic.className = "fa-solid fa-triangle-exclamation text-sm";
  } else {
    if (ib) ib.className = "p-1.5 rounded-lg text-white bg-rose-500";
    if (ic) ic.className = "fa-solid fa-circle-exclamation text-sm";
  }
  document.getElementById("alert-title").innerText = title;
  document.getElementById("alert-message").innerText = message;
  ae.classList.remove("translate-x-96", "opacity-0", "pointer-events-none");
  ae.classList.add("translate-x-0", "opacity-100");
  alertTimeout = setTimeout(() => window.closeCustomAlert(), 4000);
};

window.closeCustomAlert = function () {
  const el = document.getElementById("custom-alert");
  if (el) {
    el.classList.remove("translate-x-0", "opacity-100");
    el.classList.add("translate-x-96", "opacity-0", "pointer-events-none");
  }
};

window.showConfirmPopup = function (title, text, cb) {
  document.getElementById("confirm-title").innerText = title;
  document.getElementById("confirm-msg").innerText = text;
  document.getElementById("confirm-modal").classList.remove("hidden");
  pendingConfirmCallback = cb;
};

// ===== FIREBASE USER OPERATIONS =====
async function setUserStatus(uid, status) {
  if (!uid) return;
  try {
    // Guard: an archived or disabled profile must not be written back to
    // "online", and logging out must not erase the admin's session
    // revocation. Verify against the server before touching the document.
    try {
      const guard = await getDocFromServer(doc(db, "residents", uid));
      if (!guard.exists() || isAccountDisabled(guard.data())) {
        currentSessionToken = null;
        return;
      }
    } catch (guardErr) {
      // Cannot verify - do not write anything.
      currentSessionToken = null;
      return;
    }

    if (status) {
      currentSessionToken = generateSessionToken();
      await updateDoc(doc(db, "residents", uid), {
        isOnline: status,
        lastActive: serverTimestamp(),
        sessionToken: currentSessionToken,
        lastDeviceCheck: serverTimestamp(),
      });
    } else {
      currentSessionToken = null;
      await updateDoc(doc(db, "residents", uid), {
        isOnline: status,
        lastActive: serverTimestamp(),
        sessionToken: null,
        lastDeviceCheck: serverTimestamp(),
      });
    }
  } catch (e) {
    console.error("Status update error:", e);
  }
}

async function loadUserRegisteredEvents() {
  if (!loggedInUser?.id) return;
  try {
    const s1 = await getDocs(
      query(
        collection(db, "participants"),
        where("residentId", "==", loggedInUser.id),
        where("status", "==", STATUS.REGISTERED),
      ),
    );
    registeredEventIds.clear();
    s1.forEach((d) => registeredEventIds.add(d.data().eventId));
    sessionStorage.setItem(
      "registeredEvents",
      JSON.stringify([...registeredEventIds]),
    );
    const s2 = await getDocs(
      query(
        collection(db, "participants"),
        where("residentId", "==", loggedInUser.id),
        where("status", "==", STATUS.COMPLETED),
      ),
    );
    completedEventIds.clear();
    s2.forEach((d) => completedEventIds.add(d.data().eventId));
    sessionStorage.setItem(
      "completedEvents",
      JSON.stringify([...completedEventIds]),
    );
    return registeredEventIds;
  } catch (e) {
    return new Set();
  }
}

function setupParticipantsListener() {
  if (!loggedInUser?.id) return;
  if (participantsUnsubscribe) participantsUnsubscribe();
  participantsUnsubscribe = onSnapshot(
    query(
      collection(db, "participants"),
      where("residentId", "==", loggedInUser.id),
    ),
    (snap) => {
      registeredEventIds.clear();
      completedEventIds.clear();
      snap.forEach((d) => {
        const data = d.data();
        if (data.status === STATUS.REGISTERED)
          registeredEventIds.add(data.eventId);
        else if (data.status === STATUS.COMPLETED)
          completedEventIds.add(data.eventId);
      });
      sessionStorage.setItem(
        "registeredEvents",
        JSON.stringify([...registeredEventIds]),
      );
      sessionStorage.setItem(
        "completedEvents",
        JSON.stringify([...completedEventIds]),
      );
      if (typeof renderEvents === "function") renderEvents();
      if (typeof renderMyEvents === "function") renderMyEvents();
    },
  );
}

// ===== AUTH PANELS =====
window.toggleAuthPanels = function (showRegister) {
  const lp = document.getElementById("login-panel"),
    rp = document.getElementById("register-panel");
  if (lp && rp) {
    showLoading(showRegister ? "Loading registration..." : "Loading login...");
    setTimeout(() => {
      lp.classList.toggle("hidden", showRegister);
      rp.classList.toggle("hidden", !showRegister);
      const form = document.getElementById(
        showRegister ? "register-form" : "login-form",
      );
      if (form) form.reset();
      hideLoading();
    }, 400);
  }
};

// ===== REGISTRATION =====
document
  .getElementById("register-form")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("reg-name")?.value.trim() || "",
      email =
        document.getElementById("reg-email")?.value.trim().toLowerCase() || "";
    const phone = document.getElementById("reg-phone")?.value.trim() || "",
      age = document.getElementById("reg-age")?.value.trim() || "";
    const gender = document.getElementById("reg-gender")?.value || "",
      address = document.getElementById("reg-address")?.value.trim() || "";
    const pass = document.getElementById("reg-password")?.value || "",
      confirmPass =
        document.getElementById("reg-confirm-password")?.value || "";
    if (!name || !email || !phone || !age || !gender || !address || !pass) {
      window.showAlert("Error", "All fields required.", "error");
      return;
    }
    if (!/^[a-zA-ZñÑ\s.]+$/.test(name)) {
      window.showAlert("Error", "Invalid name.", "error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      window.showAlert("Error", "Invalid email.", "error");
      return;
    }
    if (!/^09\d{9}$/.test(phone)) {
      window.showAlert(
        "Error",
        "Phone must be 11 digits starting with 09.",
        "error",
      );
      return;
    }
    if (pass !== confirmPass) {
      window.showAlert("Error", "Passwords don't match.", "error");
      return;
    }
    if (pass.length < 6) {
      window.showAlert("Error", "Password must be 6+ characters.", "error");
      return;
    }
    showLoading("Creating account...");
    try {
      const uc = await createUserWithEmailAndPassword(auth, email, pass);
      await sendEmailVerification(uc.user);
      await setDoc(doc(db, "residents", uc.user.uid), {
        name,
        email,
        phone,
        age: parseInt(age) || 0,
        gender,
        address,
        // SECURITY: never store passwords in Firestore — Firebase Auth owns them.
        isOnline: false,
        profilePic: "",
        sessionToken: null,
        createdAt: serverTimestamp(),
        lastActive: serverTimestamp(),
        lastProfileUpdate: null,
        lastAgeUpdate: null,
        role: "resident",
      });
      await signOut(auth);
      hideLoading();
      document.getElementById("register-form")?.reset();
      window.showAlert(
        "Verification Sent!",
        "Check your email to verify.",
        "success",
      );
      window.toggleAuthPanels(false);
    } catch (err) {
      hideLoading();
      window.showAlert(
        "Error",
        err.code === "auth/email-already-in-use"
          ? "Email already registered."
          : `Failed: ${err.message}`,
        "error",
      );
    }
  });

// ===== LOGIN =====
document.getElementById("login-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email =
      document.getElementById("login-email")?.value.trim().toLowerCase() || "",
    pass = document.getElementById("login-password")?.value || "";
  if (!email || !pass) {
    window.showAlert("Error", "Enter email and password.", "error");
    return;
  }
  showLoading("Logging in...");
  try {
    const uc = await signInWithEmailAndPassword(auth, email, pass);
    await uc.user.reload();
    if (!auth.currentUser.emailVerified) {
      hideLoading();
      window.showAlert("Not Verified", "Check your email first.", "error");
      await signOut(auth);
      return;
    }
    // ===== DISABLED ACCOUNT CHECK =====
    // Admin can disable a resident from the admin terminal. Block the login
    // here, before any session is established.
    // Read straight from the SERVER. getDoc() can be answered from the local
    // IndexedDB cache, which may still hold the pre-deletion copy of this
    // document and would let an archived account walk right back in.
    let preCheck;
    try {
      preCheck = await getDocFromServer(doc(db, "residents", uc.user.uid));
    } catch (netErr) {
      // Offline or unreachable: fail CLOSED rather than trusting stale cache.
      hideLoading();
      await signOut(auth);
      clearUserSession();
      loggedInUser = null;
      window.showAlert(
        "Connection Required",
        "We could not verify your account status. Please check your internet connection and try again.",
        "error",
      );
      return;
    }
    if (preCheck.exists() && isAccountDisabled(preCheck.data())) {
      const info = preCheck.data();
      const deleted =
        info.isDeleted === true || info.accountStatus === "Deleted";
      hideLoading();
      await signOut(auth);
      clearUserSession();
      loggedInUser = null;
      window.showAlert(
        deleted ? "Account Deleted" : "Account Disabled",
        accountLockMessage(info),
        "error",
      );
      return;
    }

    if (!(await enforceSingleSession(uc.user.uid))) {
      hideLoading();
      return;
    }
    const snap = await getDoc(doc(db, "residents", uc.user.uid));
    if (snap.exists()) {
      loggedInUser = { id: snap.id, ...snap.data() };
      saveUserSession(loggedInUser);
      saveActiveTab("announcements");
      await setUserStatus(loggedInUser.id, true);
      await loadUserRegisteredEvents();
      setupParticipantsListener();
      initializeAllUserListeners();
      startSessionHeartbeat(loggedInUser.id);
      watchAccountStatus(loggedInUser.id);
      document.getElementById("auth-screen")?.classList.add("hidden");
      document.getElementById("dashboard")?.classList.remove("hidden");
      showNotificationBell();
      updateUIWithUserData(loggedInUser);
      initUserHourTracker();
      initNotificationsListener();
      window.switchTab("announcements");
      hideLoading();
      window.showAlert("Welcome!", `Hello ${loggedInUser.name}!`, "success");
    } else {
      hideLoading();
      window.showAlert("Error", "Profile not found.", "error");
      await signOut(auth);
    }
  } catch (err) {
    hideLoading();
    window.showAlert("Error", "Incorrect email or password.", "error");
  }
});

// ===== INITIALIZE ALL REAL-TIME LISTENERS =====
function initializeAllUserListeners() {
  if (!loggedInUser?.id) return;
  if (donationsUnsubscribe) donationsUnsubscribe();
  if (volunteersUnsubscribe) volunteersUnsubscribe();
  donationsUnsubscribe = onSnapshot(
    query(collection(db, "donations"), where("donorId", "==", loggedInUser.id)),
    (snap) => {
      const tbody = document.getElementById("user-donations-tbody");
      if (!tbody) return;
      if (snap.empty) {
        tbody.innerHTML =
          '<tr><td colspan="5" class="text-center py-4 text-xs text-gray-400">No donations yet.</td></tr>';
        return;
      }
      const donations = [];
      snap.forEach((d) => donations.push({ id: d.id, ...d.data() }));
      donations.sort((a, b) => {
        const ta = a.createdAt?.toDate
          ? a.createdAt.toDate()
          : new Date(a.createdAt || 0);
        const tb = b.createdAt?.toDate
          ? b.createdAt.toDate()
          : new Date(b.createdAt || 0);
        return tb - ta;
      });
      let html = "";
      donations.forEach((data) => {
        let badge =
          data.status === STATUS.APPROVED            ? '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-emerald-100 text-emerald-800">✓ Confirmed</span>'
            : data.status === STATUS.REJECTED
              ? '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-red-100 text-red-800">✗ Rejected</span>'
              : '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-amber-100 text-amber-800">Pending</span>';
        // Format donation display based on type
        let amountDisplay = "";
        if (data.donationType === "money") {
          amountDisplay = data.amount ? `₱${parseFloat(data.amount).toLocaleString()}` : data.item || "";
        } else {
          amountDisplay = data.itemDescription || data.item || "";
          if (data.itemValue && data.itemValue > 0) {
            amountDisplay += ` (₱${parseFloat(data.itemValue).toLocaleString()} value)`;
          }
        }
        html += `<tr class="border-b"><td class="px-3 py-2 text-xs">${data.donationType === "item" ? "Item " : "Php "}${amountDisplay}</td><td class="px-3 py-2 text-xs">${data.purpose || ""}</td><td class="px-3 py-2">${badge}</td><td class="px-3 py-2 text-xs text-gray-400">${data.createdAt ? formatShortDate(data.createdAt) : "N/A"}</td></tr>`;
      });
      tbody.innerHTML = html;
    },
  );
  volunteersUnsubscribe = onSnapshot(
    query(
      collection(db, "volunteers"),
      where("residentId", "==", loggedInUser.id),
    ),
    (snap) => {
      const tbody = document.getElementById("user-volunteers-tbody");
      if (!tbody) return;
      if (snap.empty) {
        tbody.innerHTML =
          '<tr><td colspan="5" class="text-center py-8 text-xs text-gray-400"><i class="fa-solid fa-hands-holding text-2xl text-gray-300 block mb-2"></i>No volunteer applications yet. Your submissions will appear here.</td></tr>';
        return;
      }
      const volunteers = [];
      snap.forEach((d) => volunteers.push({ id: d.id, ...d.data() }));
      volunteers.sort((a, b) => {
        const ta = a.createdAt?.toDate
          ? a.createdAt.toDate()
          : new Date(a.createdAt || 0);
        const tb = b.createdAt?.toDate
          ? b.createdAt.toDate()
          : new Date(b.createdAt || 0);
        return tb - ta;
      });
      let html = "";
      volunteers.forEach((data) => {
        let badge =
          data.status === STATUS.APPROVED
            ? '<span class="inline-flex items-center gap-1 text-[10px] rounded-full px-2.5 py-1 font-bold bg-emerald-100 text-emerald-800"><i class="fa-solid fa-circle-check"></i>Approved</span>'
            : data.status === STATUS.REJECTED
              ? '<span class="inline-flex items-center gap-1 text-[10px] rounded-full px-2.5 py-1 font-bold bg-red-100 text-red-800"><i class="fa-solid fa-circle-xmark"></i>Rejected</span>'
              : '<span class="inline-flex items-center gap-1 text-[10px] rounded-full px-2.5 py-1 font-bold bg-amber-100 text-amber-800"><i class="fa-solid fa-hourglass-half"></i>Pending Review</span>';
        const skillName = escapeAnnouncementHtml(data.skills || "—");
        const experienceText = data.experience
          ? `<span class="block text-[10px] text-gray-400 mt-0.5">${escapeAnnouncementHtml(data.experience)}</span>`
          : "";
        const notesText = data.notes
          ? `<span class="block text-[10px] text-gray-400 mt-0.5 italic" title="${escapeAnnouncementHtml(data.notes)}">"${escapeAnnouncementHtml(data.notes.length > 40 ? data.notes.slice(0, 37) + "..." : data.notes)}"</span>`
          : "";
        const fileName = escapeAnnouncementHtml(
          data.verificationFile?.fileName || "Document",
        );
        const fileCell =
          data.verificationFile && data.verificationFile.data
            ? `<button type="button" onclick="viewMyVolunteerFile('${data.id}')" class="inline-flex items-center gap-1.5 text-xs text-tsu-blue hover:text-tsu-accent font-semibold hover:underline" title="View / download your submitted file"><i class="fa-solid fa-file-shield"></i><span class="truncate max-w-[120px]">${fileName}</span></button>`
            : '<span class="text-xs text-gray-400">No file</span>';
        const dateApplied = data.createdAt
          ? formatShortDate(data.createdAt)
          : "N/A";
        html += `<tr class="border-b hover:bg-gray-50/70 transition-colors"><td class="px-3 py-3 text-xs font-semibold text-gray-800">${skillName}${experienceText}${notesText}</td><td class="px-3 py-3 text-xs text-gray-600">${escapeAnnouncementHtml(data.availability || "—")}</td><td class="px-3 py-3">${fileCell}</td><td class="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">${dateApplied}</td><td class="px-3 py-3">${badge}</td></tr>`;
      });
      tbody.innerHTML = html;
    },
  );
}

// ===== RESIDENT: VIEW / DOWNLOAD OWN VOLUNTEER PROOF FILE =====
function downloadStoredBase64File(dataUrl, fileName) {
  try {
    const parts = String(dataUrl).split(",");
    const mime =
      (parts[0].match(/data:(.*?);/) || [])[1] || "application/octet-stream";
    const byteString = atob(parts[1] || "");
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++)
      bytes[i] = byteString.charCodeAt(i);
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch (e) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

window.viewMyVolunteerFile = async function (id) {
  if (!loggedInUser?.id || !id) return;
  showLoading("Loading file...");
  try {
    const snap = await getDoc(doc(db, "volunteers", id));
    if (
      !snap.exists() ||
      snap.data().residentId !== loggedInUser.id ||
      !snap.data().verificationFile?.data
    ) {
      hideLoading();
      window.showAlert(
        "No File",
        "No proof file is attached to this application.",
        "error",
      );
      return;
    }
    const file = snap.data().verificationFile;
    const dataUrl = file.data;
    const fileName = file.fileName || "verification-file";
    const fileType = file.fileType || "application/octet-stream";
    const ext = fileName.split(".").pop().toLowerCase();
    const isImage =
      fileType.startsWith("image/") ||
      ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext);
    const isPdf = fileType === "application/pdf" || ext === "pdf";

    document.getElementById("my-volunteer-file-modal")?.remove();
    const modal = document.createElement("div");
    modal.id = "my-volunteer-file-modal";
    modal.className =
      "fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-[180]";
    modal.onclick = function (e) {
      if (e.target === this) this.remove();
    };
    const safeName = escapeAnnouncementHtml(fileName);
    const previewHtml = isImage
      ? `<img src="${dataUrl}" alt="${safeName}" class="max-w-full max-h-[60vh] object-contain rounded-lg shadow-md mx-auto">`
      : isPdf
        ? `<embed src="${dataUrl}" type="application/pdf" class="w-full h-[60vh] bg-white rounded-lg">`
        : `<div class="text-center py-10 text-gray-500"><i class="fa-solid fa-file-arrow-down text-4xl text-tsu-blue mb-3"></i><p class="text-sm font-semibold">Preview not available for this file type.</p><p class="text-xs text-gray-400 mt-1">Download the file to open it.</p></div>`;
    modal.innerHTML = `<div class="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl border modal-enter flex flex-col"><div class="p-4 border-b flex items-center justify-between shrink-0"><div class="min-w-0 pr-3"><h3 class="text-sm font-extrabold text-tsu-blue flex items-center gap-2"><i class="fa-solid fa-file-shield"></i>Your Submitted Proof</h3><p class="text-xs text-gray-400 truncate mt-0.5">${safeName}</p></div><button type="button" onclick="document.getElementById('my-volunteer-file-modal').remove()" class="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-lg transition-all shrink-0"><i class="fa-solid fa-xmark text-lg"></i></button></div><div class="flex-1 bg-gray-100 p-4 overflow-auto" style="min-height:0">${previewHtml}</div><div class="p-4 border-t bg-white shrink-0 flex items-center justify-center gap-3"><button type="button" id="my-volunteer-file-download" class="flex items-center justify-center gap-2 bg-tsu-blue text-white font-semibold py-2.5 px-6 rounded-xl text-sm hover:bg-tsu-accent transition-colors"><i class="fa-solid fa-download"></i> Download File</button><button type="button" onclick="document.getElementById('my-volunteer-file-modal').remove()" class="bg-gray-100 text-gray-700 font-semibold py-2.5 px-6 rounded-xl text-sm hover:bg-gray-200 transition-colors">Close</button></div></div>`;
    document.body.appendChild(modal);
    modal
      .querySelector("#my-volunteer-file-download")
      .addEventListener("click", () =>
        downloadStoredBase64File(dataUrl, fileName),
      );
    hideLoading();
  } catch (e) {
    hideLoading();
    window.showAlert("Error", "Failed to load the file.", "error");
  }
};
window.downloadMyVolunteerFile = function (id) {
  window.viewMyVolunteerFile(id);
};

// ===== NOTIFICATION SYSTEM =====
function showNotificationBell() {
  const bell = document.getElementById("notification-bell-container");
  if (bell) bell.style.display = "block";
}

function hideNotificationBell() {
  const bell = document.getElementById("notification-bell-container");
  if (bell) bell.style.display = "none";
}

function initNotificationsListener() {
  if (!loggedInUser?.id) return;
  if (notificationsUnsubscribe) notificationsUnsubscribe();
  notificationsUnsubscribe = onSnapshot(
    query(
      collection(db, "notifications"),
      where("residentId", "==", loggedInUser.id),
    ),
    (snap) => {
      notificationCount = 0;
      allNotifications = [];
      snap.forEach((d) => {
        const notif = { id: d.id, ...d.data() };
        allNotifications.push(notif);
        if (!notif.read) notificationCount++;
      });
      allNotifications.sort((a, b) => {
        const ta = a.createdAt?.toDate
          ? a.createdAt.toDate()
          : new Date(a.createdAt || 0);
        const tb = b.createdAt?.toDate
          ? b.createdAt.toDate()
          : new Date(b.createdAt || 0);
        return tb - ta;
      });
      updateNotificationBadge();
      renderNotificationDropdown();
      renderMobileNotificationDropdown();
    },
  );
}

function updateNotificationBadge() {
  const badge = document.getElementById("notification-count-badge"),
    mBadge = document.getElementById("mobile-notification-count-badge");
  if (badge) {
    if (notificationCount > 0) {
      badge.textContent = notificationCount > 99 ? "99+" : notificationCount;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }
  if (mBadge) {
    if (notificationCount > 0) {
      mBadge.textContent = notificationCount > 99 ? "99+" : notificationCount;
      mBadge.classList.remove("hidden");
    } else {
      mBadge.classList.add("hidden");
    }
  }
}

function renderNotificationDropdown() {
  const container = document.getElementById("notification-dropdown-list"),
    unreadSpan = document.getElementById("dropdown-unread-count");
  const toggleBtn = document.getElementById("notification-toggle-more-btn"),
    dropdown = document.getElementById("notification-dropdown");
  if (!container) return;
  if (unreadSpan) {
    if (notificationCount > 0) {
      unreadSpan.textContent = `${notificationCount} new`;
      unreadSpan.classList.remove("hidden");
    } else {
      unreadSpan.classList.add("hidden");
    }
  }
  if (allNotifications.length === 0) {
    container.innerHTML = `<div class="text-center py-10"><div class="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3"><i class="fa-solid fa-bell-slash text-xl text-gray-300"></i></div><p class="text-sm text-gray-400 font-medium">No notifications yet</p></div>`;
    if (toggleBtn) toggleBtn.classList.add("hidden");
    return;
  }
  if (toggleBtn) toggleBtn.classList.remove("hidden");
  const toShow = showingAllNotifications
    ? allNotifications
    : allNotifications.slice(0, 5);
  const hasMore = allNotifications.length > 5;
  if (toggleBtn) {
    if (showingAllNotifications)
      toggleBtn.innerHTML =
        '<i class="fa-solid fa-chevron-up mr-1"></i> Show Less';
    else if (hasMore)
      toggleBtn.innerHTML = `<i class="fa-solid fa-chevron-down mr-1"></i> See All (${allNotifications.length})`;
    else toggleBtn.classList.add("hidden");
  }
  if (dropdown) {
    dropdown.style.maxHeight = showingAllNotifications ? "85vh" : "60vh";
    container.style.maxHeight = showingAllNotifications ? "75vh" : "50vh";
  }
  let html = "";
  toShow.forEach((notif) => {
    let iconBg = "bg-blue-50 text-blue-600",
      icon = "fa-bell";
    switch (notif.type) {
      case "volunteer_approved":
        iconBg = "bg-emerald-50 text-emerald-600";
        icon = "fa-circle-check";
        break;
      case "volunteer_rejected":
        iconBg = "bg-rose-50 text-rose-600";
        icon = "fa-circle-xmark";
        break;
      case "donation_confirmed":
        iconBg = "bg-emerald-50 text-emerald-600";
        icon = "fa-circle-check";
        break;
      case "donation_rejected":
        iconBg = "bg-rose-50 text-rose-600";
        icon = "fa-circle-xmark";
        break;
      case "hours_credited":
        iconBg = "bg-purple-50 text-purple-600";
        icon = "fa-clock";
        break;
      case "contact_status_update":
      case "feedback_status":
        iconBg = "bg-indigo-50 text-indigo-600";
        icon = "fa-envelope-circle-check";
        break;
    }
    const isUnread = !notif.read,
      timeDisplay = notif.createdAt
        ? formatRelativeTime(notif.createdAt)
        : "Just now";
    html += `<div onclick="window.handleNotificationClick('${notif.id}','${notif.type || "default"}')" class="p-4 hover:bg-gray-100 cursor-pointer transition-all duration-200 ${isUnread ? "bg-blue-50/30 hover:bg-blue-50/50" : "hover:bg-gray-50"} border-b border-gray-100 last:border-b-0 group"><div class="flex items-start space-x-3"><div class="w-10 h-10 ${iconBg} rounded-full flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 transition-transform"><i class="fa-solid ${icon} text-sm"></i></div><div class="flex-1 min-w-0"><div class="flex items-center justify-between gap-2"><p class="text-sm font-semibold text-gray-800 truncate group-hover:text-tsu-blue transition-colors">${notif.title || "Notification"}</p>${isUnread ? '<div class="w-2.5 h-2.5 bg-blue-500 rounded-full shrink-0 animate-pulse"></div>' : ""}</div><p class="text-xs text-gray-600 mt-1 line-clamp-2 leading-relaxed">${notif.message || ""}</p><div class="flex items-center justify-between mt-2"><p class="text-[10px] text-gray-400 flex items-center"><i class="fa-solid fa-clock mr-1"></i>${timeDisplay}</p><span class="text-[10px] text-tsu-blue font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center">Tap to view <i class="fa-solid fa-arrow-right ml-0.5 text-[9px]"></i></span></div></div></div></div>`;
  });
  container.innerHTML = html;
}

window.toggleMoreNotifications = function () {
  showingAllNotifications = !showingAllNotifications;
  renderNotificationDropdown();
};

window.toggleNotificationDropdown = function () {
  const dropdown = document.getElementById("notification-dropdown"),
    bellBtn = document.getElementById("notification-bell-btn");
  if (!dropdown || !bellBtn) return;
  if (dropdown.classList.contains("hidden")) {
    const rect = bellBtn.getBoundingClientRect(),
      dw = 320,
      vw = window.innerWidth;
    let lp = rect.right + 15;
    if (lp + dw > vw) lp = vw - dw - 10;
    dropdown.style.cssText = `position:fixed;top:${rect.bottom + 8}px;left:${lp}px;right:auto;bottom:auto;transform:none;width:${dw}px`;
    showingAllNotifications = false;
    renderNotificationDropdown();
    dropdown.classList.remove("hidden");
    setTimeout(
      () => document.addEventListener("click", closeNotificationOnClickOutside),
      100,
    );
  } else {
    closeNotificationDropdown();
  }
};

function closeNotificationDropdown() {
  const d = document.getElementById("notification-dropdown");
  if (d) {
    d.classList.add("hidden");
    showingAllNotifications = false;
  }
  document.removeEventListener("click", closeNotificationOnClickOutside);
}

function closeNotificationOnClickOutside(e) {
  const d = document.getElementById("notification-dropdown"),
    b = document.getElementById("notification-bell-btn");
  if (
    d &&
    !d.classList.contains("hidden") &&
    !d.contains(e.target) &&
    b &&
    !b.contains(e.target)
  )
    closeNotificationDropdown();
}

window.handleNotificationClick = async function (notifId, type) {
  const notif = allNotifications.find((n) => n.id === notifId);
  if (notif) {
    window.openNotificationDetail(
      notifId,
      type || "default",
      notif.title || "Notification",
      notif.message || "",
      notif.createdAt ? formatRelativeTime(notif.createdAt) : "Just now",
    );
  }
  await window.markNotificationAsRead(notifId);
  closeNotificationDropdown();
  closeMobileNotificationDropdown();
};

window.markNotificationAsRead = async function (notifId) {
  try {
    await updateDoc(doc(db, "notifications", notifId), { read: true });
  } catch (e) {}
};

window.markAllNotificationsAsRead = async function () {
  if (!loggedInUser?.id) return;
  showLoading();
  try {
    const snap = await getDocs(
      query(
        collection(db, "notifications"),
        where("residentId", "==", loggedInUser.id),
        where("read", "==", false),
      ),
    );
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.forEach((d) => batch.update(d.ref, { read: true }));
      await batch.commit();
    }
    hideLoading();
    window.showAlert("Success", "All notifications marked as read.", "success");
  } catch (e) {
    hideLoading();
  }
};

// ===== MOBILE NOTIFICATION FUNCTIONS =====
window.toggleMobileNotificationDropdown = function () {
  const dropdown = document.getElementById("mobile-notification-dropdown"),
    bellBtn = document.getElementById("mobile-notification-bell-btn");
  if (!dropdown || !bellBtn) return;
  const dd = document.getElementById("notification-dropdown");
  if (dd && !dd.classList.contains("hidden")) {
    dd.classList.add("hidden");
    showingAllNotifications = false;
  }
  if (dropdown.classList.contains("hidden")) {
    mobileShowingAllNotifications = false;
    renderMobileNotificationDropdown();
    dropdown.classList.remove("hidden");
    setTimeout(
      () =>
        document.addEventListener(
          "click",
          closeMobileNotificationOnClickOutside,
        ),
      100,
    );
  } else {
    closeMobileNotificationDropdown();
  }
};

function closeMobileNotificationDropdown() {
  const d = document.getElementById("mobile-notification-dropdown");
  if (d) {
    d.classList.add("hidden");
    mobileShowingAllNotifications = false;
  }
  document.removeEventListener("click", closeMobileNotificationOnClickOutside);
}

function closeMobileNotificationOnClickOutside(e) {
  const d = document.getElementById("mobile-notification-dropdown"),
    b = document.getElementById("mobile-notification-bell-btn");
  if (
    d &&
    !d.classList.contains("hidden") &&
    !d.contains(e.target) &&
    b &&
    !b.contains(e.target)
  )
    closeMobileNotificationDropdown();
}

function renderMobileNotificationDropdown() {
  const container = document.getElementById(
      "mobile-notification-dropdown-list",
    ),
    unreadSpan = document.getElementById("mobile-dropdown-unread-count"),
    toggleBtn = document.getElementById("mobile-notification-toggle-more-btn"),
    dropdown = document.getElementById("mobile-notification-dropdown");
  if (!container) return;
  if (unreadSpan) {
    if (notificationCount > 0) {
      unreadSpan.textContent = `${notificationCount} new`;
      unreadSpan.classList.remove("hidden");
    } else {
      unreadSpan.classList.add("hidden");
    }
  }
  if (allNotifications.length === 0) {
    container.innerHTML = `<div class="text-center py-10"><div class="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3"><i class="fa-solid fa-bell-slash text-xl text-gray-300"></i></div><p class="text-sm text-gray-400 font-medium">No notifications yet</p></div>`;
    if (toggleBtn) toggleBtn.classList.add("hidden");
    return;
  }
  if (toggleBtn) toggleBtn.classList.remove("hidden");
  const toShow = mobileShowingAllNotifications
    ? allNotifications
    : allNotifications.slice(0, 5);
  const hasMore = allNotifications.length > 5;
  if (toggleBtn) {
    if (mobileShowingAllNotifications)
      toggleBtn.innerHTML =
        '<i class="fa-solid fa-chevron-up mr-1"></i> Show Less';
    else if (hasMore)
      toggleBtn.innerHTML = `<i class="fa-solid fa-chevron-down mr-1"></i> See All (${allNotifications.length})`;
    else toggleBtn.classList.add("hidden");
  }
  if (dropdown) {
    dropdown.style.maxHeight = mobileShowingAllNotifications ? "85vh" : "60vh";
    container.style.maxHeight = mobileShowingAllNotifications ? "75vh" : "50vh";
  }
  let html = "";
  toShow.forEach((notif) => {
    let iconBg = "bg-blue-50 text-blue-600",
      icon = "fa-bell";
    switch (notif.type) {
      case "volunteer_approved":
        iconBg = "bg-emerald-50 text-emerald-600";
        icon = "fa-circle-check";
        break;
      case "volunteer_rejected":
        iconBg = "bg-rose-50 text-rose-600";
        icon = "fa-circle-xmark";
        break;
      case "donation_confirmed":
        iconBg = "bg-emerald-50 text-emerald-600";
        icon = "fa-circle-check";
        break;
      case "donation_rejected":
        iconBg = "bg-rose-50 text-rose-600";
        icon = "fa-circle-xmark";
        break;
      case "hours_credited":
        iconBg = "bg-purple-50 text-purple-600";
        icon = "fa-clock";
        break;
      case "contact_status_update":
      case "feedback_status":
        iconBg = "bg-indigo-50 text-indigo-600";
        icon = "fa-envelope-circle-check";
        break;
    }
    const isUnread = !notif.read,
      timeDisplay = notif.createdAt
        ? formatRelativeTime(notif.createdAt)
        : "Just now";
    html += `<div onclick="window.handleNotificationClick('${notif.id}','${notif.type || "default"}'); closeMobileNotificationDropdown();" class="p-4 hover:bg-gray-100 cursor-pointer transition-all duration-200 ${isUnread ? "bg-blue-50/30" : "hover:bg-gray-50"} border-b border-gray-100"><div class="flex items-start space-x-3"><div class="w-9 h-9 ${iconBg} rounded-full flex items-center justify-center shrink-0 shadow-sm"><i class="fa-solid ${icon} text-xs"></i></div><div class="flex-1 min-w-0"><div class="flex items-center justify-between gap-2"><p class="text-xs font-semibold text-gray-800 truncate">${notif.title || "Notification"}</p>${isUnread ? '<div class="w-2 h-2 bg-blue-500 rounded-full shrink-0"></div>' : ""}</div><p class="text-[11px] text-gray-600 mt-0.5 line-clamp-2">${notif.message || ""}</p><p class="text-[9px] text-gray-400 mt-1.5"><i class="fa-solid fa-clock mr-1"></i>${timeDisplay}</p></div></div></div>`;
  });
  container.innerHTML = html;
}

window.toggleMoreMobileNotifications = function () {
  mobileShowingAllNotifications = !mobileShowingAllNotifications;
  renderMobileNotificationDropdown();
};

// ===== PROFILE FIELDS =====
function disableAllProfileFields() {
  [
    "prof-name",
    "prof-phone",
    "prof-address",
    "prof-password",
    "prof-age",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = true;
      el.classList.add("bg-gray-100", "cursor-not-allowed", "opacity-60");
    }
  });
  ["prof-gender"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = true;
      el.classList.add("bg-gray-100", "cursor-not-allowed");
    }
  });
  const ut = document.getElementById("upload-trigger");
  if (ut) {
    ut.style.pointerEvents = "none";
    ut.style.opacity = "0.6";
    ut.classList.add("cursor-not-allowed");
  }
  const ip = document.getElementById("profile-img-preview");
  if (ip) {
    ip.style.opacity = "1";
    ip.style.border = "3px solid rgba(10,41,71,0.15)";
  }
  document.getElementById("remove-profile-pic-btn")?.classList.add("hidden");
  document.getElementById("profile-pic-pending")?.classList.add("hidden");
  const tb = document.getElementById("toggle-prof-password");
  if (tb) {
    tb.disabled = true;
    tb.classList.add("opacity-60", "cursor-not-allowed");
  }
  const fi = document.getElementById("profile-pic-input");
  if (fi) fi.disabled = true;
  updateEditButtonText();
}

function updateEditButtonText() {
  const ab = document.getElementById("profile-action-btn");
  if (!ab || !loggedInUser) return;
  ab.innerHTML =
    '<i class="fa-solid fa-pen-to-square text-[10px] mr-1"></i><span class="text-[10px]">Edit Profile</span>';
  ab.classList.remove("btn-primary", "opacity-60", "cursor-not-allowed");
  ab.classList.add("btn-secondary");
  ab.setAttribute("data-mode", "edit");
  ab.setAttribute("onclick", "toggleEditMode()");
  ab.disabled = false;
}

function enableAllProfileFields() {
  ["prof-phone", "prof-address", "prof-password"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = false;
      el.classList.remove("bg-gray-100", "cursor-not-allowed", "opacity-60");
    }
  });
  const ut = document.getElementById("upload-trigger");
  if (ut) {
    ut.style.pointerEvents = "auto";
    ut.style.opacity = "1";
    ut.classList.remove("cursor-not-allowed");
  }
  const ip = document.getElementById("profile-img-preview");
  if (ip) ip.style.opacity = "1";
  const hasPic = loggedInUser?.profilePic && loggedInUser.profilePic !== "",
    hasPend = selectedProfilePicFile instanceof File;
  const rb = document.getElementById("remove-profile-pic-btn");
  if (rb && (hasPic || hasPend || (ip && !ip.classList.contains("hidden"))))
    rb.classList.remove("hidden");
  const tb = document.getElementById("toggle-prof-password");
  if (tb) {
    tb.disabled = false;
    tb.classList.remove("opacity-60", "cursor-not-allowed");
  }
  const fi = document.getElementById("profile-pic-input");
  if (fi) fi.disabled = false;
}

window.toggleEditMode = function () {
  const ab = document.getElementById("profile-action-btn");
  if (!ab) return;
  if (ab.getAttribute("data-mode") === "edit") {
    showLoading("Preparing edit mode...");
    setTimeout(() => {
      enableAllProfileFields();
      ab.innerHTML =
        '<i class="fa-solid fa-floppy-disk text-[10px] mr-1"></i><span class="text-[10px]">Save Changes</span>';
      ab.classList.remove("btn-secondary", "opacity-60", "cursor-not-allowed");
      ab.classList.add("btn-primary");
      ab.setAttribute("data-mode", "save");
      ab.setAttribute("onclick", "saveProfileChanges()");
      ab.disabled = false;
      document.getElementById("cancel-edit-btn")?.classList.remove("hidden");
      hideLoading();
      window.showAlert(
        "Edit Mode",
        "You can now edit your profile.",
        "success",
      );
    }, 500);
  }
};

window.cancelEdit = function () {
  showLoading("Cancelling...");
  setTimeout(() => {
    selectedProfilePicFile = undefined;
    document.getElementById("profile-pic-pending")?.classList.add("hidden");
    const fi = document.getElementById("profile-pic-input");
    if (fi) fi.value = "";
    if (loggedInUser) updateUIWithUserData(loggedInUser);
    disableAllProfileFields();
    document.getElementById("cancel-edit-btn")?.classList.add("hidden");
    const ab = document.getElementById("profile-action-btn");
    if (ab) {
      ab.innerHTML =
        '<i class="fa-solid fa-pen-to-square text-[10px] mr-1"></i><span class="text-[10px]">Edit Profile</span>';
      ab.classList.remove("btn-primary");
      ab.classList.add("btn-secondary");
      ab.setAttribute("data-mode", "edit");
      ab.setAttribute("onclick", "toggleEditMode()");
    }
    hideLoading();
    window.showAlert("Cancelled", "Changes discarded.", "success");
    document.getElementById("prof-password").type = "password";
  }, 400);
};

window.saveProfileChanges = function () {
  showLoading("Saving...");
  setTimeout(() => {
    const pf = document.getElementById("profile-form");
    if (pf) {
      if (typeof pf.requestSubmit === "function") pf.requestSubmit();
      else
        pf.dispatchEvent(
          new Event("submit", { cancelable: true, bubbles: true }),
        );
    }
    hideLoading();
  }, 300);
};

// ===== RE-AUTHENTICATION HELPERS (for password changes) =====
/**
 * Firebase refuses updatePassword() when the login session is too old
 * (auth/requires-recent-login). Prompt for the current password and
 * re-authenticate so the password change can go through.
 */
function promptForReauthPassword(errorMessage = "") {
  return new Promise((resolve) => {
    document.getElementById("reauth-modal")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "reauth-modal";
    overlay.className =
      "fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4";

    const finish = (value) => {
      overlay.remove();
      document.body.style.overflow = "";
      resolve(value);
    };

    overlay.innerHTML = `<div class="bg-white rounded-2xl max-w-sm w-full p-7 border border-gray-200 modal-enter relative">
      <button type="button" data-reauth-cancel class="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><i class="fa-solid fa-xmark text-xl"></i></button>
      <div class="w-14 h-14 bg-tsu-light text-tsu-blue rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl"><i class="fa-solid fa-shield-halved"></i></div>
      <h3 class="text-lg font-extrabold text-center text-gray-900">Confirm it's you</h3>
      <p class="text-sm text-gray-500 text-center mt-2">For your security, enter your <span class="font-semibold">current password</span> before setting a new one.</p>
      <div class="relative mt-4">
        <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400"><i class="fa-solid fa-lock text-xs"></i></span>
        <input type="password" id="reauth-password" autocomplete="current-password" placeholder="Current password"
          class="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-tsu-blue/20 focus:border-tsu-blue" />
      </div>
      <p data-reauth-error class="${errorMessage ? "" : "hidden "}mt-2 text-xs font-medium text-red-600 flex items-start space-x-1.5"><i class="fa-solid fa-circle-exclamation mt-0.5 text-[10px]"></i><span>${errorMessage}</span></p>
      <div class="grid grid-cols-2 gap-3 mt-5">
        <button type="button" data-reauth-cancel class="px-4 py-2.5 rounded-xl text-sm border text-gray-600 font-semibold">Cancel</button>
        <button type="button" data-reauth-confirm class="px-4 py-2.5 rounded-xl text-sm bg-tsu-blue text-tsu-gold font-semibold">Verify</button>
      </div></div>`;

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    const input = overlay.querySelector("#reauth-password");
    const showError = (msg) => {
      const err = overlay.querySelector("[data-reauth-error]");
      if (err) {
        err.querySelector("span").textContent = msg;
        err.classList.remove("hidden");
      }
      input.classList.add("border-red-500");
      input.value = "";
      input.focus();
    };
    input.addEventListener("input", () => {
      input.classList.remove("border-red-500");
      overlay.querySelector("[data-reauth-error]")?.classList.add("hidden");
    });

    overlay
      .querySelectorAll("[data-reauth-cancel]")
      .forEach((b) => b.addEventListener("click", () => finish(null)));
    overlay
      .querySelector("[data-reauth-confirm]")
      .addEventListener("click", () => {
        const v = input.value;
        if (!v) {
          showError("Please enter your current password.");
          return;
        }
        finish(v);
      });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        overlay.querySelector("[data-reauth-confirm]").click();
      }
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) finish(null);
    });
    setTimeout(() => input.focus(), 60);
  });
}

/**
 * Re-authenticate the signed-in resident with their current password.
 * Re-prompts with an inline error on a wrong password.
 * Returns true once verified, false if the user cancels.
 */
async function ensureRecentLogin() {
  if (!auth.currentUser) return false;
  let lastError = "";
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const currentPassword = await promptForReauthPassword(lastError);
    if (currentPassword === null) return false; // user cancelled
    showLoading("Verifying password...");
    try {
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email,
        currentPassword,
      );
      await reauthenticateWithCredential(auth.currentUser, credential);
      hideLoading();
      return true;
    } catch (reErr) {
      hideLoading();
      if (
        ["auth/invalid-credential", "auth/wrong-password"].includes(
          reErr?.code,
        )
      ) {
        lastError = "Incorrect current password. Please try again.";
        continue; // prompt again with the error shown
      }
      throw reErr;
    }
  }
}

// ===== PROFILE FORM =====
const profileForm = document.getElementById("profile-form");
if (profileForm) {
  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ab = document.getElementById("profile-action-btn");
    if (!ab || ab.getAttribute("data-mode") !== "save") return;
    if (isSaving || !loggedInUser?.id) return;
    const phone = document.getElementById("prof-phone")?.value.trim() || "",
      address = document.getElementById("prof-address")?.value.trim() || "";
    const pi = document.getElementById("prof-password");
    // Blank password field = keep current password (managed by Firebase Auth only)
    const password = pi && pi.value.trim() !== "" ? pi.value.trim() : "";
    const hasNonPwd =
      phone !== (loggedInUser.phone || "") ||
      address !== (loggedInUser.address || "");
    const hasPwd = password.length > 0,
      hasInfo = hasNonPwd || hasPwd;
    const hasPic = selectedProfilePicFile !== undefined,
      isNewPic = selectedProfilePicFile instanceof File,
      isRemoving = selectedProfilePicFile === null;
    if (!hasInfo && !hasPic) {
      window.showAlert("No Changes", "Nothing to save.", "error");
      return;
    }
    if (hasNonPwd && phone && !/^09\d{9}$/.test(phone)) {
      window.showAlert("Error", "Invalid phone.", "error");
      return;
    }
    if (hasPwd && password.length < 6) {
      window.showAlert(
        "Error",
        "New password must be at least 6 characters.",
        "error",
      );
      return;
    }
    isSaving = true;
    showLoading("Saving...");
    if (ab) {
      ab.disabled = true;
      ab.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin text-[10px] mr-1"></i><span class="text-[10px]">Saving...</span>';
    }
    try {
      const ud = {},
        su = {},
        now = new Date();
      if (hasPic) {
        if (isNewPic) {
          const pic = await uploadProfilePicture(
            loggedInUser.id,
            selectedProfilePicFile,
          );
          ud.profilePic = pic;
          su.profilePic = pic;
        } else if (isRemoving) {
          ud.profilePic = "";
          su.profilePic = "";
        }
      }
      if (hasInfo) {
        if (hasPwd && auth.currentUser) {
          try {
            await updatePassword(auth.currentUser, password);
          } catch (pwErr) {
            if (pwErr?.code === "auth/requires-recent-login") {
              // Session is too old for a sensitive change: verify the
              // current password first, then retry the update.
              hideLoading();
              const verified = await ensureRecentLogin();
              if (!verified) {
                throw new Error(
                  "Password change cancelled. Identity verification is required to set a new password.",
                );
              }
              showLoading("Saving...");
              await updatePassword(auth.currentUser, password);
            } else if (pwErr?.code === "auth/weak-password") {
              throw new Error(
                "The new password is too weak. Use at least 6 characters.",
              );
            } else {
              throw pwErr;
            }
          }
        }
        if (hasNonPwd) {
          ud.phone = phone;
          ud.address = address;
          ud.lastProfileUpdate = serverTimestamp();
          su.phone = phone;
          su.address = address;
          su.lastProfileUpdate = now.toISOString();
        }
      }
      if (Object.keys(ud).length > 0)
        await updateDoc(doc(db, "residents", loggedInUser.id), ud);
      if (Object.keys(su).length > 0) {
        Object.assign(loggedInUser, su);
        saveUserSession(loggedInUser);
      }
      selectedProfilePicFile = undefined;
      updateUIWithUserData(loggedInUser);
      disableAllProfileFields();
      hideLoading();
      document.getElementById("cancel-edit-btn")?.classList.add("hidden");
      let msg = hasNonPwd ? "Profile updated" : "";
      if (hasPwd) msg += (msg ? " & " : "") + "password changed";
      if (isNewPic) msg += (msg ? " & " : "") + "picture updated";
      if (isRemoving) msg += (msg ? " & " : "") + "picture removed";
      window.showAlert("Success!", msg + "! Fields locked.", "success");
      document.getElementById("prof-password").type = "password";
    } catch (error) {
      hideLoading();
      window.showAlert("Error", `Failed: ${error.message}`, "error");
      if (ab) {
        ab.disabled = false;
        ab.innerHTML =
          '<i class="fa-solid fa-floppy-disk text-[10px] mr-1"></i><span class="text-[10px]">Save Changes</span>';
        ab.classList.add("btn-primary");
      }
    } finally {
      isSaving = false;
    }
  });
}

// ===== PASSWORD TOGGLE & CONFIRM BUTTONS =====
document
  .getElementById("toggle-prof-password")
  ?.addEventListener("click", function () {
    const pf = document.getElementById("prof-password"),
      ic = document.getElementById("prof-password-icon");
    if (!pf) return;
    if (pf.type === "password") {
      pf.type = "text";
      if (ic) {
        ic.classList.remove("fa-eye");
        ic.classList.add("fa-eye-slash");
      }
    } else {
      pf.type = "password";
      if (ic) {
        ic.classList.remove("fa-eye-slash");
        ic.classList.add("fa-eye");
      }
    }
  });

document.getElementById("confirm-cancel-btn")?.addEventListener("click", () => {
  document.getElementById("confirm-modal")?.classList.add("hidden");
  pendingConfirmCallback = null;
});

document
  .getElementById("confirm-proceed-btn")
  ?.addEventListener("click", () => {
    document.getElementById("confirm-modal")?.classList.add("hidden");
    if (typeof pendingConfirmCallback === "function") pendingConfirmCallback();
    pendingConfirmCallback = null;
  });

// ===== ANNOUNCEMENTS =====
onSnapshot(
  query(collection(db, "announcements"), orderBy("createdAt", "desc")),
  (snap) => {
    const container = document.getElementById("announcements-container"),
      publicContainer = document.getElementById(
        "public-announcements-container",
      );
    const emptyHtml =
      '<div class="text-center py-10 bg-white rounded-xl border shadow-sm"><div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fa-solid fa-bullhorn text-2xl text-gray-300"></i></div><p class="text-base text-gray-400">No announcements yet.</p></div>';

    announcementsById.clear();
    if (snap.empty) {
      if (container) container.innerHTML = emptyHtml;
      if (publicContainer) publicContainer.innerHTML = emptyHtml;
      return;
    }

    let html = "";
    snap.forEach((snapshotDoc) => {
      const announcement = { id: snapshotDoc.id, ...snapshotDoc.data() };
      announcementsById.set(snapshotDoc.id, announcement);

      let badgeClass = "bg-gray-100 text-gray-600",
        badgeIcon = "fa-circle-info";
      if (announcement.priority === "Important") {
        badgeClass = "bg-amber-100 text-amber-700";
        badgeIcon = "fa-circle-exclamation";
      } else if (announcement.priority === "Emergency") {
        badgeClass = "bg-red-100 text-red-700";
        badgeIcon = "fa-triangle-exclamation";
      }

      const relativeTime = announcement.createdAt
        ? formatRelativeTime(announcement.createdAt)
        : "Recently";
      const fullDate = announcement.createdAt
        ? formatFullDateTime(announcement.createdAt)
        : "Recently";
      const title = escapeAnnouncementHtml(
        announcement.title || "Untitled announcement",
      );
      const description = escapeAnnouncementHtml(
        announcement.desc || announcement.description || "",
      );
      const priority = escapeAnnouncementHtml(
        announcement.priority || "Notice",
      );
      const imageUrl = getSafeAnnouncementImageUrl(
        announcement.imageUrl || announcement.image,
      );
      const imageHtml = imageUrl
        ? `<div class="w-full bg-gray-100 border-b border-gray-100 overflow-hidden flex justify-center"><img src="${escapeAnnouncementHtml(imageUrl)}" alt="${title}" class="max-w-full h-auto max-h-96 object-contain" loading="lazy" decoding="async"></div>`
        : "";

      html += `<article data-announcement-id="${escapeAnnouncementHtml(snapshotDoc.id)}" role="button" tabindex="0" aria-label="Read announcement: ${title}" class="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all cursor-pointer overflow-hidden group focus:outline-none focus:ring-2 focus:ring-tsu-blue/30">${imageHtml}<div class="p-5 sm:p-6"><div class="flex items-center justify-between mb-3"><div class="flex items-center space-x-3"><div class="w-10 h-10 bg-gradient-to-br from-tsu-blue to-tsu-dark rounded-xl flex items-center justify-center shadow-sm shrink-0"><i class="fa-solid fa-building-columns text-tsu-gold text-sm"></i></div><div class="min-w-0"><h4 class="font-bold text-sm text-gray-900">Municipality of Victoria</h4><div class="flex items-center space-x-2 mt-1"><span class="text-[11px] text-gray-400" title="${escapeAnnouncementHtml(fullDate)}"><i class="fa-solid fa-clock mr-1"></i>${escapeAnnouncementHtml(relativeTime)}</span><span class="text-[11px] px-2 py-0.5 rounded-full font-bold ${badgeClass}"><i class="fa-solid ${badgeIcon} mr-1 text-[10px]"></i>${priority}</span></div></div></div></div><h3 class="text-base sm:text-lg font-extrabold text-gray-900 group-hover:text-tsu-blue transition-colors line-clamp-2 leading-snug mb-2">${title}</h3><p class="text-sm text-gray-500 mt-2 line-clamp-3 leading-relaxed">${description}</p></div><div class="px-5 sm:px-6 py-3 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between"><span class="text-xs text-tsu-blue font-semibold group-hover:underline">Read More <i class="fa-solid fa-arrow-right ml-1.5 text-[11px]"></i></span></div></article>`;
    });

    if (container) container.innerHTML = html;
    if (publicContainer) publicContainer.innerHTML = html;
  },
);

document.addEventListener("click", (event) => {
  const card = event.target.closest("[data-announcement-id]");
  if (card) window.openAnnouncementDetails(card.dataset.announcementId);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest("[data-announcement-id]");
  if (!card) return;
  event.preventDefault();
  window.openAnnouncementDetails(card.dataset.announcementId);
});

window.openAnnouncementDetails = function (announcementId) {
  const announcement = announcementsById.get(announcementId);
  if (!announcement) return;

  const title = announcement.title || "Untitled announcement";
  const priority = announcement.priority || "Notice";
  const date = announcement.createdAt
    ? formatFullDateTime(announcement.createdAt)
    : "Recently";
  const imageUrl = getSafeAnnouncementImageUrl(
    announcement.imageUrl || announcement.image,
  );
  const modalTitle = document.getElementById("modal-announcement-title"),
    modalDescription = document.getElementById("modal-announcement-desc"),
    modalDate = document.getElementById("modal-announcement-date"),
    modalBadge = document.getElementById("modal-announcement-badge"),
    textPanel = document.getElementById("modal-announcement-text-panel"),
    imageContainer = document.getElementById(
      "modal-announcement-image-container",
    ),
    modalImage = document.getElementById("modal-announcement-image");

  if (modalTitle) modalTitle.textContent = title;
  if (modalDescription) {
    modalDescription.textContent =
      announcement.desc || announcement.description || "No description.";
  }
  if (modalDate) {
    modalDate.innerHTML = `<i class="fa-solid fa-clock mr-1"></i>${escapeAnnouncementHtml(date)}`;
    modalDate.title = date;
  }
  if (modalBadge) {
    modalBadge.textContent = priority;
    modalBadge.className =
      "text-xs font-bold uppercase px-3.5 py-1 rounded-full";
    if (priority === "Important")
      modalBadge.classList.add("bg-amber-100", "text-amber-700");
    else if (priority === "Emergency")
      modalBadge.classList.add("bg-red-100", "text-red-700");
    else modalBadge.classList.add("bg-gray-100", "text-gray-600");
  }

  if (imageContainer && modalImage && imageUrl) {
    textPanel?.classList.remove("md:col-span-2");
    modalImage.alt = `${title} announcement image`;
    modalImage.onerror = function () {
      imageContainer.classList.add("hidden");
      textPanel?.classList.add("md:col-span-2");
      this.removeAttribute("src");
    };
    modalImage.src = imageUrl;
    imageContainer.classList.remove("hidden");
  } else if (imageContainer && modalImage) {
    imageContainer.classList.add("hidden");
    textPanel?.classList.add("md:col-span-2");
    modalImage.removeAttribute("src");
    modalImage.alt = "";
  }

  window.toggleModal("view-announcement-modal");
};

// ===== EVENT HANDLERS =====
window.handleRegisterClick = function (e, eid, et, ed, etm, el) {
  e.preventDefault();
  e.stopPropagation();
  window.confirmJoinEvent(eid, et, ed, etm, el);
  return false;
};

window.handleUnregisterClick = function (e, eid, et) {
  e.preventDefault();
  e.stopPropagation();
  window.unregisterFromEvent(eid, et);
  return false;
};

/** Event action buttons — distinct colors per state (Join = gold, Completed = green, Cancel = red). */
function eventJoinButtonHtml(onclickAttr) {
  return `<button type="button" onclick="${onclickAttr}" class="event-btn-join text-xs font-bold text-[#FFFFFF] bg-[#062764] hover:bg-[#062153] px-4 py-2 rounded-lg transition-all shadow-sm flex items-center justify-center space-x-1.5 w-full relative z-10"><i class="fa-solid fa-calendar-plus"></i><span>Join</span></button>`;
}
function eventCompletedButtonHtml() {
  return '<span class="event-btn-completed inline-flex items-center gap-2 text-xs font-semibold text-[#07cf7c] bg-[#001F3F] px-3 py-2 rounded-lg border border-[#07cf7c] w-full justify-center pointer-events-none"><i class="fa-solid fa-circle-check text-xs"></i><span>Completed</span></span>';
}
function eventCancelButtonHtml(onclickAttr, extraClass) {
  return `<button type="button" onclick="${onclickAttr}" class="event-btn-cancel text-xs font-semibold text-[#B42318] hover:text-white bg-[#FEE4E2] hover:bg-[#B42318] px-3 py-2 rounded-lg transition-all border border-[#FECACA] w-full relative z-10${extraClass ? " " + extraClass : ""}"><i class="fa-solid fa-calendar-minus mr-1.5"></i>Cancel Registration</button>`;
}

// ===== RENDER EVENTS =====
function renderPublicEvents() {
  const grid = document.getElementById("public-events-grid");
  if (!grid) return;
  getDocs(query(collection(db, "events"), orderBy("date", "asc"))).then(
    (snap) => {
      if (snap.empty) {
        grid.innerHTML =
          '<div class="col-span-full text-center py-10 bg-white rounded-xl border shadow-sm"><p class="text-sm text-gray-500">No upcoming events.</p></div>';
        return;
      }
      let html = "";
      snap.forEach((d) => {
        const ev = d.data();
        const esc = (t) => {
          const div = document.createElement("div");
          div.textContent = t || "";
          return div.innerHTML.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        };
        const dd = ev.date || "TBA",
          td = ev.time ? formatTimeDisplay(ev.time) : "";
        let ti = "fa-calendar-check",
          pg = "from-tsu-blue to-tsu-dark";
        switch (ev.type) {
          case "Seminar":
            ti = "fa-chalkboard-user";
            pg = "from-[#800000] to-[#A52A2A]";
            break;
          case "Workshop":
            ti = "fa-toolbox";
            pg = "from-[#A52A2A] to-[#8B0000]";
            break;
          case "Meeting":
            ti = "fa-users";
            pg = "from-[#D49300] to-[#8B6914]";
            break;
          case "Sports":
            ti = "fa-futbol";
            pg = "from-[#005B9F] to-[#003B71]";
            break;
          case "Health":
            ti = "fa-heart-pulse";
            pg = "from-[#8B0000] to-[#600000]";
            break;
          case "Training":
            ti = "fa-graduation-cap";
            pg = "from-[#005B9F] to-[#003B71]";
            break;
          case "Celebration":
            ti = "fa-cake-candles";
            pg = "from-[#F2A900] to-[#D49300]";
            break;
          case "Outreach":
            ti = "fa-hand-holding-heart";
            pg = "from-[#003B71] to-[#005B9F]";
            break;
          case "Environmental":
            ti = "fa-leaf";
            pg = "from-[#001F3F] to-[#003B71]";
            break;
          case "Cultural":
            ti = "fa-masks-theater";
            pg = "from-[#F2A900] to-[#D49300]";
            break;
          case "Fundraising":
            ti = "fa-sack-dollar";
            pg = "from-[#A52A2A] to-[#800000]";
            break;
        }
        const hi = ev.imageUrl && ev.imageUrl !== "";
        const is = hi
          ? `<div class="relative h-40 overflow-hidden rounded-t-xl"><img src="${ev.imageUrl}" alt="${esc(ev.title)}" class="w-full h-full object-cover"><div class="absolute top-3 left-3"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider event-type-badge text-white px-2.5 py-1 rounded-full"><i class="fa-solid ${ti} text-[#F2A900] text-[10px]"></i><span>${ev.type || "Event"}</span></span></div></div>`
          : `<div class="relative h-40 bg-gradient-to-br ${pg} flex items-center justify-center overflow-hidden rounded-t-xl"><i class="fa-solid ${ti} text-white/30 text-5xl"></i><div class="absolute top-3 left-3"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider event-type-badge text-white px-2.5 py-1 rounded-full"><i class="fa-solid ${ti} text-[#F2A900] text-[10px]"></i><span>${ev.type || "Event"}</span></span></div></div>`;
        const ab = eventJoinButtonHtml(
          "window.showAlert('Authentication Required','Please log in or create an account to join community events.','error')",
        );
        html += `<div class="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col"><div onclick="openEventDetails('${esc(ev.title)}','${dd}','${td}','${esc(ev.location)}','${esc(ev.desc || "")}')" class="cursor-pointer group">${is}<div class="p-4 pb-2"><h3 class="text-sm font-bold text-gray-900 group-hover:text-[#F2A900] transition-colors line-clamp-2 leading-snug mb-2">${ev.title || "Untitled Event"}</h3><div class="space-y-2"><div class="flex items-center space-x-1.5 text-xs text-[#353535]"><i class="fa-solid fa-calendar text-[#D49300] w-4"></i><span class="font-semibold text-[#353535]">${dd}</span>${td ? `<span class="font-medium text-[#353535]">| ${td}</span>` : ""}</div><div class="flex items-center space-x-1.5 text-xs text-[#353535]"><i class="fa-solid fa-location-dot text-[#D49300] w-4"></i><span class="font-semibold text-[#353535] truncate">${ev.location || "TBA"}</span></div></div></div></div><div class="px-4 pb-4 pt-3 border-t border-gray-100 mt-auto">${ab}</div></div>`;
      });
      grid.innerHTML = html;
    },
  );
}

function renderEvents() {
  const grid = document.getElementById("events-grid");
  if (!grid) return;
  getDocs(query(collection(db, "events"), orderBy("date", "asc"))).then(
    (snap) => {
      if (snap.empty) {
        grid.innerHTML =
          '<div class="col-span-full text-center py-16 bg-white rounded-xl border shadow-sm"><p class="text-base text-gray-400">No upcoming events.</p></div>';
        return;
      }
      let html = "";
      snap.forEach((d) => {
        const ev = d.data(),
          id = d.id;
        const esc = (t) => {
          const div = document.createElement("div");
          div.textContent = t || "";
          return div.innerHTML.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        };
        const isReg = registeredEventIds.has(id),
          isComp = completedEventIds.has(id);
        const dd = ev.date || "TBA",
          td = ev.time ? formatTimeDisplay(ev.time) : "";
        const hi = ev.imageUrl && ev.imageUrl !== "";
        let ti, pg;
        switch (ev.type) {
          case "Seminar":
            ti = "fa-chalkboard-user";
            pg = "from-[#800000] to-[#A52A2A]";
            break;
          case "Workshop":
            ti = "fa-toolbox";
            pg = "from-[#A52A2A] to-[#8B0000]";
            break;
          case "Meeting":
            ti = "fa-users";
            pg = "from-[#D49300] to-[#8B6914]";
            break;
          case "Sports":
            ti = "fa-futbol";
            pg = "from-[#005B9F] to-[#003B71]";
            break;
          case "Health":
            ti = "fa-heart-pulse";
            pg = "from-[#8B0000] to-[#600000]";
            break;
          case "Training":
            ti = "fa-graduation-cap";
            pg = "from-[#005B9F] to-[#003B71]";
            break;
          case "Celebration":
            ti = "fa-cake-candles";
            pg = "from-[#F2A900] to-[#D49300]";
            break;
          case "Outreach":
            ti = "fa-hand-holding-heart";
            pg = "from-[#003B71] to-[#005B9F]";
            break;
          case "Environmental":
            ti = "fa-leaf";
            pg = "from-[#001F3F] to-[#003B71]";
            break;
          case "Cultural":
            ti = "fa-masks-theater";
            pg = "from-[#F2A900] to-[#D49300]";
            break;
          case "Fundraising":
            ti = "fa-sack-dollar";
            pg = "from-[#A52A2A] to-[#800000]";
            break;
          default:
            ti = "fa-calendar-check";
            pg = "from-[#003B71] to-[#005B9F]";
        }
        const is = hi
          ? `<div class="relative h-40 overflow-hidden"><img src="${ev.imageUrl}" alt="${esc(ev.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"><div class="absolute top-3 left-3"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider event-type-badge text-white px-2.5 py-1 rounded-full pointer-events-none"><i class="fa-solid ${ti} text-[#F2A900] text-[10px]"></i><span>${ev.type || "Event"}</span></span></div></div>`
          : `<div class="relative h-40 bg-gradient-to-br ${pg} flex items-center justify-center overflow-hidden"><i class="fa-solid ${ti} text-white/30 text-6xl pointer-events-none"></i><div class="absolute top-3 left-3"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider event-type-badge text-white px-2.5 py-1 rounded-full pointer-events-none"><i class="fa-solid ${ti} text-[#F2A900] text-[10px]"></i><span>${ev.type || "Event"}</span></span></div></div>`;
        let ab = "";
        if (isComp) ab = eventCompletedButtonHtml();
        else if (isReg)
          ab = eventCancelButtonHtml(
            `handleUnregisterClick(event,'${id}','${esc(ev.title)}')`,
          );
        else
          ab = eventJoinButtonHtml(
            `handleRegisterClick(event,'${id}','${esc(ev.title)}','${dd}','${td}','${esc(ev.location)}')`,
          );
        html += `<div class="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col"><div onclick="openEventDetails('${esc(ev.title)}','${dd}','${td}','${esc(ev.location)}','${esc(ev.desc || "")}')" class="cursor-pointer group">${is}<div class="p-4 pb-2"><h3 class="text-sm font-bold text-gray-900 group-hover:text-[#F2A900] transition-colors line-clamp-2 leading-snug mb-2">${ev.title || "Untitled Event"}</h3><div class="space-y-2"><div class="flex items-center space-x-1.5 text-xs text-[#353535]-500"><i class="fa-solid fa-calendar text-[#353535] w-4"></i><span class="font-medium text-[#353535]">${dd}</span>${td ? `<span class="text-[#353535]-800">| ${td}</span>` : ""}</div><div class="flex items-center space-x-1.5 text-xs text-gray-500"><i class="fa-solid fa-location-dot text-[#353535] w-4"></i><span class="font-medium text-[#353535] truncate">${ev.location || "TBA"}</span></div></div></div></div><div class="px-4 pb-4 pt-3 border-t border-gray-100 mt-auto">${ab}</div></div>`;
      });
      grid.innerHTML = html;
    },
  );
}

function renderMyEvents() {
  const grid = document.getElementById("my-events-grid");
  if (!grid) return;
  if (
    !loggedInUser ||
    (registeredEventIds.size === 0 && completedEventIds.size === 0)
  ) {
    grid.innerHTML =
      '<div class="col-span-full text-center py-16 bg-white rounded-xl border shadow-sm"><p class="text-base text-gray-400">No registered events.</p></div>';
    return;
  }
  getDocs(query(collection(db, "events"), orderBy("date", "asc"))).then(
    (snap) => {
      let html = "",
        found = false;
      snap.forEach((d) => {
        const ev = d.data(),
          id = d.id;
        if (!registeredEventIds.has(id) && !completedEventIds.has(id)) return;
        found = true;
        const esc = (t) => {
          const div = document.createElement("div");
          div.textContent = t || "";
          return div.innerHTML.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        };
        const isComp = completedEventIds.has(id);
        const sb = isComp
          ? '<span class="event-btn-completed inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full"><i class="fa-solid fa-circle-check text-[9px]"></i><span>Completed</span></span>'
          : '<span class="event-badge-registered inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full"><i class="fa-solid fa-clock text-[9px]"></i><span>Registered</span></span>';
        const cb = !isComp
          ? eventCancelButtonHtml(
              `handleUnregisterClick(event,'${id}','${esc(ev.title)}')`,
              "mt-2",
            )
          : "";
        let ti, pg;
        switch (ev.type) {
          case "Seminar":
            ti = "fa-chalkboard-user";
            pg = "from-[#800000] to-[#A52A2A]";
            break;
          case "Workshop":
            ti = "fa-toolbox";
            pg = "from-[#A52A2A] to-[#8B0000]";
            break;
          case "Meeting":
            ti = "fa-users";
            pg = "from-[#D49300] to-[#8B6914]";
            break;
          case "Sports":
            ti = "fa-futbol";
            pg = "from-[#005B9F] to-[#003B71]";
            break;
          case "Health":
            ti = "fa-heart-pulse";
            pg = "from-[#8B0000] to-[#600000]";
            break;
          case "Training":
            ti = "fa-graduation-cap";
            pg = "from-[#005B9F] to-[#003B71]";
            break;
          case "Celebration":
            ti = "fa-cake-candles";
            pg = "from-[#F2A900] to-[#D49300]";
            break;
          case "Outreach":
            ti = "fa-hand-holding-heart";
            pg = "from-[#003B71] to-[#005B9F]";
            break;
          case "Environmental":
            ti = "fa-leaf";
            pg = "from-[#001F3F] to-[#003B71]";
            break;
          case "Cultural":
            ti = "fa-masks-theater";
            pg = "from-[#F2A900] to-[#D49300]";
            break;
          case "Fundraising":
            ti = "fa-sack-dollar";
            pg = "from-[#A52A2A] to-[#800000]";
            break;
          default:
            ti = "fa-calendar-check";
            pg = "from-[#003B71] to-[#005B9F]";
        }
        const hi = ev.imageUrl && ev.imageUrl !== "";
        const is = hi
          ? `<div class="relative h-32 overflow-hidden"><img src="${ev.imageUrl}" alt="${esc(ev.title)}" class="w-full h-full object-cover pointer-events-none"><div class="absolute top-2 left-2"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider event-type-badge text-white px-2 py-0.5 rounded-full"><i class="fa-solid ${ti} text-[#F2A900] text-[9px]"></i><span>${ev.type || "Event"}</span></span></div></div>`
          : `<div class="relative h-32 bg-gradient-to-br ${pg} flex items-center justify-center overflow-hidden"><i class="fa-solid ${ti} text-white/30 text-5xl"></i><div class="absolute top-2 left-2"><span class="inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider event-type-badge text-white px-2 py-0.5 rounded-full"><i class="fa-solid ${ti} text-[#F2A900] text-[9px]"></i><span>${ev.type || "Event"}</span></span></div></div>`;
        html += `<div class="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col"><div onclick="openEventDetails('${esc(ev.title)}','${ev.date || "TBA"}','${ev.time ? formatTimeDisplay(ev.time) : ""}','${esc(ev.location)}','${esc(ev.desc || "")}')" class="cursor-pointer group">${is}<div class="p-4 pb-2"><div class="flex items-center justify-between mb-2"><h3 class="text-sm font-bold text-gray-900 group-hover:text-[#F2A900] transition-colors line-clamp-1 leading-snug flex-1 mr-2">${ev.title || "Untitled Event"}</h3>${sb}</div><div class="space-y-1.5"><div class="flex items-center space-x-1.5 text-xs text-[#353535]"><i class="fa-solid fa-calendar text-[#D49300] w-4"></i><span class="font-semibold text-[#353535]">${ev.date || "TBA"}</span>${ev.time ? `<span class="font-medium text-[#353535]">| ${formatTimeDisplay(ev.time)}</span>` : ""}</div><div class="flex items-center space-x-1.5 text-xs text-[#353535]"><i class="fa-solid fa-location-dot text-[#D49300] w-4"></i><span class="font-semibold text-[#353535] truncate">${ev.location || "TBA"}</span></div></div></div></div>${cb ? `<div class="px-4 pb-4">${cb}</div>` : ""}</div>`;
      });
      grid.innerHTML = found
        ? html
        : '<div class="col-span-full text-center py-16 bg-white rounded-xl border shadow-sm"><p class="text-base text-gray-400">No active records.</p></div>';
    },
  );
}

// ===== EVENT OPERATIONS =====
window.confirmJoinEvent = function (eid, et, ed, etm, el) {
  if (!loggedInUser) {
    window.showAlert("Error", "Please login.", "error");
    return;
  }
  if (registeredEventIds.has(eid) || completedEventIds.has(eid)) {
    window.showAlert("Already Registered", "", "error");
    return;
  }
  let msg = `Join: "${et}"?`;
  if (ed) msg += `\nDate: ${ed}`;
  if (etm) msg += `\nTime: ${etm}`;
  if (el) msg += `\nLocation: ${el}`;
  window.showConfirmPopup("Join Event?", msg, async () => {
    await performJoinEvent(eid, et);
  });
};

async function performJoinEvent(eid, et) {
  showLoading("Joining...");
  try {
    const snap = await getDocs(
      query(
        collection(db, "participants"),
        where("residentId", "==", loggedInUser.id),
        where("eventId", "==", eid),
        limit(1),
      ),
    );
    if (!snap.empty) {
      let found = false;
      snap.forEach((d) => {
        if (
          d.data().status === STATUS.REGISTERED ||
          d.data().status === STATUS.COMPLETED
        )
          found = true;
      });
      if (found) {
        hideLoading();
        window.showAlert("Already Registered", "", "error");
        return;
      }
    }
    await addDoc(collection(db, "participants"), {
      residentId: loggedInUser.id,
      residentName: loggedInUser.name,
      residentEmail: loggedInUser.email,
      eventTitle: et,
      eventId: eid,
      timestamp: serverTimestamp(),
      status: STATUS.REGISTERED,
    });
    registeredEventIds.add(eid);
    sessionStorage.setItem(
      "registeredEvents",
      JSON.stringify([...registeredEventIds]),
    );
    renderEvents();
    renderMyEvents();
    hideLoading();
    window.showAlert("Success!", `Registered for "${et}".`, "success");
  } catch (e) {
    hideLoading();
    window.showAlert("Error", "Failed to register.", "error");
  }
}

window.unregisterFromEvent = function (eid, et) {
  if (!loggedInUser) return;
  window.showConfirmPopup("Cancel?", `Unregister from "${et}"?`, async () => {
    showLoading("Cancelling...");
    try {
      const snap = await getDocs(
        query(
          collection(db, "participants"),
          where("residentId", "==", loggedInUser.id),
          where("eventId", "==", eid),
          where("status", "==", STATUS.REGISTERED),
          limit(1),
        ),
      );
      if (!snap.empty) {
        const p = [];
        snap.forEach((d) =>
          p.push(
            updateDoc(doc(db, "participants", d.id), {
              status: STATUS.CANCELLED,
              cancelledAt: serverTimestamp(),
            }),
          ),
        );
        await Promise.all(p);
      }
      registeredEventIds.delete(eid);
      sessionStorage.setItem(
        "registeredEvents",
        JSON.stringify([...registeredEventIds]),
      );
      renderEvents();
      renderMyEvents();
      hideLoading();
      window.showAlert("Cancelled", "Unregistered.", "success");
    } catch (e) {
      hideLoading();
      window.showAlert("Error", "Failed.", "error");
    }
  });
};

eventsUnsubscribe = onSnapshot(
  query(collection(db, "events"), orderBy("date", "asc")),
  () => {
    renderEvents();
    renderPublicEvents();
  },
);

// ===== DONATIONS & HOURS =====
// ===== UPDATED DONATIONS LISTENER =====
onSnapshot(
  query(collection(db, "donations"), orderBy("createdAt", "desc")),
  (snap) => {
    const tbody = document.getElementById("public-donations-tbody");
    if (!tbody) return;
    let html = "";
    snap.forEach((d) => {
      const data = d.data();
      if (data.status === STATUS.APPROVED) {
        const donationType = data.donationType || "Php";
        let typeDisplay = donationType === "item" ? "Item" : "Php";
        let amountDisplay = "";
        
        if (donationType === "money") {
          amountDisplay = data.amount ? `₱${parseFloat(data.amount).toLocaleString()}` : data.item || "";
        } else {
          amountDisplay = data.itemDescription || data.item || "";
          if (data.itemValue && data.itemValue > 0) {
            amountDisplay += ` (₱${parseFloat(data.itemValue).toLocaleString()} value)`;
          }
        }
        
        let statusBadge = data.status === STATUS.APPROVED
            ? '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-emerald-100 text-emerald-800">✓ Confirmed</span>'
            : data.status === STATUS.REJECTED
            ? '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-red-100 text-red-800">✗ Rejected</span>'
            : '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-amber-100 text-amber-800">⏳ Pending</span>';
        
        html += `<tr class="border-b">
            <td class="px-3 py-2 font-bold text-xs">${data.donorName || "Anonymous"}</td>
            <td class="px-3 py-2 text-xs">${typeDisplay}</td>
            <td class="px-3 py-2 text-xs">${amountDisplay}</td>
            <td class="px-3 py-2 text-xs">${data.purpose || ""}</td>
            <td class="px-3 py-2">${statusBadge}</td>
        </tr>`;
      }
    });
    tbody.innerHTML = html ||
        '<tr><td colspan="5" class="text-center py-4 text-xs text-gray-400">No confirmed donations yet.</td></tr>';
  },
);

function initUserHourTracker() {
  if (!loggedInUser?.id) return;
  if (hoursUnsubscribe) hoursUnsubscribe();
  hoursUnsubscribe = onSnapshot(
    query(
      collection(db, "service_hours"),
      where("residentId", "==", loggedInUser.id),
    ),
    (snap) => {
      const tbody = document.getElementById("user-hours-tbody"),
        display = document.getElementById("total-hours-display");
      if (!tbody || !display) return;
      let html = "",
        total = 0;
      snap.forEach((d) => {
        const data = d.data();
        if (data.status === STATUS.APPROVED)
          total += parseFloat(data.hours || 0);
        let badge =
          data.status === STATUS.APPROVED
            ? '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-emerald-100 text-emerald-800">✓ Approved</span>'
            : data.status === STATUS.REJECTED
              ? '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-red-100 text-red-800">✗ Rejected</span>'
              : '<span class="text-[10px] rounded-full px-2 py-0.5 font-bold bg-amber-100 text-amber-800">Pending</span>';
        html += `<tr class="border-b"><td class="px-3 py-2 text-xs">${data.eventTitle || "Community Service"}</td><td class="px-3 py-2 text-xs font-bold">${data.hours || 0} hrs</td><td class="px-3 py-2">${badge}</td></tr>`;
      });
      tbody.innerHTML =
        html ||
        '<tr><td colspan="3" class="text-center py-4 text-xs text-gray-400">No hours recorded yet.</td></tr>';
      display.innerText = `${total} Hours`;
    },
  );
}

// ===== VOLUNTEER FORM =====
document
  .getElementById("volunteer-form")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!loggedInUser) {
      window.showAlert("Error", "Please login first.", "error");
      return;
    }
    const skills = document.getElementById("vol-skills")?.value || "",
      availability = document.getElementById("vol-avail")?.value || "",
      experience = document.getElementById("vol-experience")?.value || "",
      notes = document.getElementById("vol-notes")?.value.trim() || "";
    if (!skills) {
      window.showAlert("Error", "Select your primary skill.", "error");
      return;
    }
    if (!availability) {
      window.showAlert("Error", "Select your availability.", "error");
      return;
    }
    if (!selectedSkillVerificationFile) {
      window.showAlert("Error", "Upload proof of your skill.", "error");
      return;
    }
    showLoading("Submitting...");
    try {
      let vd = null;
      if (selectedSkillVerificationFile)
        vd = await convertFileToBase64(selectedSkillVerificationFile);
      await addDoc(collection(db, "volunteers"), {
        residentId: loggedInUser.id,
        name: loggedInUser.name,
        email: loggedInUser.email,
        skills,
        experience,
        verificationFile: vd
          ? {
              fileName: selectedSkillVerificationFile.name,
              fileType: selectedSkillVerificationFile.type,
              fileSize: selectedSkillVerificationFile.size,
              data: vd,
              uploadedAt: new Date().toISOString(),
            }
          : null,
        notes,
        availability,
        createdAt: serverTimestamp(),
        status: STATUS.PENDING,
      });
      hideLoading();
      document.getElementById("volunteer-form")?.reset();
      removeSkillVerification();
      window.showAlert(
        "Application Submitted!",
        "Your volunteer application has been submitted for review.",
        "success",
      );
    } catch (err) {
      hideLoading();
      window.showAlert("Error", "Failed to submit.", "error");
    }
  });

window.handleSkillVerificationUpload = function (event) {
  const file = event.target.files[0];
  if (!file) return;
  if (
    ![
      "application/pdf",
      "image/jpeg",
      "image/png",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ].includes(file.type)
  ) {
    window.showAlert("Error", "Invalid file type.", "error");
    event.target.value = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    window.showAlert("Error", "File < 5MB.", "error");
    event.target.value = "";
    return;
  }
  selectedSkillVerificationFile = file;
  const ph = document.getElementById("skill-upload-placeholder"),
    pv = document.getElementById("skill-upload-preview"),
    fn = document.getElementById("skill-file-name"),
    fs = document.getElementById("skill-file-size"),
    dz = document.getElementById("skill-verification-dropzone");
  if (ph) ph.classList.add("hidden");
  if (pv) pv.classList.remove("hidden");
  if (fn) fn.textContent = file.name;
  if (fs) {
    const sk = (file.size / 1024).toFixed(1),
      sm = (file.size / (1024 * 1024)).toFixed(1);
    fs.textContent = file.size > 1024 * 1024 ? `${sm} MB` : `${sk} KB`;
  }
  if (dz) {
    dz.classList.add("border-emerald-500", "bg-emerald-50");
    dz.classList.remove("border-gray-300");
  }
};

window.removeSkillVerification = function () {
  selectedSkillVerificationFile = null;
  const inp = document.getElementById("skill-verification-input"),
    ph = document.getElementById("skill-upload-placeholder"),
    pv = document.getElementById("skill-upload-preview"),
    dz = document.getElementById("skill-verification-dropzone");
  if (inp) inp.value = "";
  if (ph) ph.classList.remove("hidden");
  if (pv) pv.classList.add("hidden");
  if (dz) {
    dz.classList.remove("border-emerald-500", "bg-emerald-50");
    dz.classList.add("border-gray-300");
  }
};

function convertFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===== DONATION FORM =====
// ===== DONATION TYPE SWITCHING =====
window.switchDonationType = function (type) {
  const isMoney = type === "money";
  const moneyTab = document.getElementById("donation-type-money");
  const itemTab = document.getElementById("donation-type-item");
  const moneyForm = document.getElementById("donation-money-form");
  const itemForm = document.getElementById("donation-item-form");
  const hint = document.getElementById("donation-type-hint");
  const activeCls =
    "donation-type-btn is-active flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all";
  const idleCls =
    "donation-type-btn flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all";

  function paint(btn, active) {
    if (!btn) return;
    btn.className = active ? activeCls : idleCls;
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    btn.style.background = active ? "#ffffff" : "transparent";
    btn.style.color = active ? "#001F3F" : "#64748B";
    btn.style.boxShadow = active
      ? "0 2px 8px rgba(0,31,63,0.16), 0 1px 2px rgba(0,31,63,0.08)"
      : "none";
    const icon = btn.querySelector("i");
    if (icon) icon.style.color = active ? "#003B71" : "#64748B";
  }

  paint(moneyTab, isMoney);
  paint(itemTab, !isMoney);
  if (moneyForm) moneyForm.classList.toggle("hidden", !isMoney);
  if (itemForm) itemForm.classList.toggle("hidden", isMoney);
  if (hint) {
    hint.textContent = isMoney
      ? "Active: Money donation"
      : "Active: Item donation";
  }
};

// ===== SET DONATION AMOUNT =====
window.setDonationAmount = function (amount) {
  const inp = document.getElementById("don-amount");
  if (inp) {
    inp.value = amount;
  }
};

// ===== MONEY DONATION FORM =====
document.getElementById("donation-money-form")?.addEventListener("submit", async function (e) {
  e.preventDefault();
  
  if (!loggedInUser) {
    window.showAlert("Error", "Please login.", "error");
    return;
  }
  
  const amount = parseFloat(document.getElementById("don-amount")?.value || 0);
  const purpose = document.getElementById("don-money-purpose")?.value.trim() || "";
  
  if (!amount || amount <= 0 || isNaN(amount)) {
    window.showAlert("Error", "Please enter a valid amount.", "error");
    return;
  }
  
  if (!purpose) {
    window.showAlert("Error", "Please enter a purpose for your donation.", "error");
    return;
  }
  
  // Open payment modal for money donation
  window.openPaymentModal(`₱${amount.toLocaleString()}`, purpose, "money", amount);
});

// ===== ITEM DONATION FORM =====
document.getElementById("donation-item-form")?.addEventListener("submit", async function (e) {
  e.preventDefault();
  
  if (!loggedInUser) {
    window.showAlert("Error", "Please login.", "error");
    return;
  }
  
  const itemDescription = document.getElementById("don-item-description")?.value.trim() || "";
  const itemValue = parseFloat(document.getElementById("don-item-value")?.value || 0);
  const purpose = document.getElementById("don-item-purpose")?.value.trim() || "";
  
  if (!itemDescription) {
    window.showAlert("Error", "Please describe the items you're donating.", "error");
    return;
  }
  
  if (!purpose) {
    window.showAlert("Error", "Please enter a purpose for your donation.", "error");
    return;
  }
  
  // Show loading
  window.showLoading("Submitting donation...");
  
  try {
    // Save item donation directly (no payment needed)
    const donationData = {
      donorName: loggedInUser.name || "Anonymous",
      donorId: loggedInUser.id || "",
      donationType: "item",
      itemDescription: itemDescription,
      itemValue: itemValue > 0 ? itemValue : null,
      purpose: purpose,
      status: STATUS.PENDING,
      createdAt: serverTimestamp()
    };
    
    await addDoc(collection(db, "donations"), donationData);
    
    // Reset form
    document.getElementById("donation-item-form").reset();
    
    window.hideLoading();
    window.showAlert("Thank You!", "Your item donation has been submitted for review. The municipality will contact you for pickup or drop-off details.", "success");
    
  } catch (error) {
    window.hideLoading();
    window.showAlert("Error", "Failed to submit donation. Please try again.", "error");
    console.error("Item donation error:", error);
  }
});

// ===== TAB SWITCHER =====
window.switchTab = function (tabId) {
  closeAllHeaderDropdowns();
  closeMobileMenu();
  const nd = document.getElementById("notification-dropdown");
  if (nd && !nd.classList.contains("hidden")) {
    nd.classList.add("hidden");
    showingAllNotifications = false;
  }
  const mnd = document.getElementById("mobile-notification-dropdown");
  if (mnd && !mnd.classList.contains("hidden")) {
    mnd.classList.add("hidden");
    mobileShowingAllNotifications = false;
  }
  if (isTabSwitching) return;
  isTabSwitching = true;
  showLoading("Loading...");
  setTimeout(() => {
    document
      .querySelectorAll(".tab-content")
      .forEach((el) => el.classList.add("hidden"));
    const target = document.getElementById(tabId);
    if (target) target.classList.remove("hidden");
    document.querySelectorAll(".nav-link").forEach((btn) => {
      btn.className =
        "nav-link w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-[11px] text-gray-300 transition-all";
    });
    const activeBtn = Array.from(document.querySelectorAll(".nav-link")).find(
      (b) => b.getAttribute("onclick")?.includes(tabId),
    );
    if (activeBtn)
      activeBtn.className =
        "nav-link w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-[11px] bg-tsu-dark text-tsu-gold border border-tsu-gold/20 shadow-lg";
    saveActiveTab(tabId);
    if (tabId === "my-events") renderMyEvents();
    if (tabId === "profile" && loggedInUser) {
      setTimeout(() => {
        disableAllProfileFields();
        document.getElementById("cancel-edit-btn")?.classList.add("hidden");
      }, 100);
    }
    setTimeout(() => {
      hideLoading();
      isTabSwitching = false;
    }, 300);
  }, 600);
};

window.openEventDetails = function (title, date, time, location, desc) {
  const mT = document.getElementById("modal-event-title"),
    mD = document.getElementById("modal-event-date"),
    mL = document.getElementById("modal-event-location"),
    mDesc = document.getElementById("modal-event-desc");
  if (mT) mT.innerText = title;
  let dd = `Date: ${date || "TBA"}`;
  if (time) dd += ` at ${time}`;
  if (mD) mD.innerHTML = `<i class="fa-solid fa-calendar mr-1.5"></i>${dd}`;
  if (mL)
    mL.innerHTML = `<i class="fa-solid fa-location-dot mr-1.5"></i>Location: ${location || "TBA"}`;
  if (mDesc) mDesc.innerHTML = desc;
  window.toggleModal("view-event-modal");
};

window.toggleModal = function (modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.toggle("hidden");
};

// ===== INITIALIZATION =====
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("donation-type-money")) {
    window.switchDonationType("money");
  }
  setupPhoneRestrictions();
  hideNotificationBell();
  renderPublicEvents();
  closeAllHeaderDropdowns();

  document.addEventListener("click", function (e) {
    const triggers = document.querySelectorAll(".header-dropdown-trigger");
    let inside = false;
    triggers.forEach((t) => {
      if (t.contains(e.target)) inside = true;
    });
    if (!inside) closeAllHeaderDropdowns();
    const tBtn = e.target.closest(".header-dropdown-trigger > button");
    if (tBtn) {
      e.preventDefault();
      e.stopPropagation();
      const p = tBtn.parentElement,
        d = p.querySelector(".header-dropdown");
      const isOpen = d && d.classList.contains("show");
      closeAllHeaderDropdowns();
      if (d && !isOpen) d.classList.add("show");
    }
    const dLink = e.target.closest(".header-dropdown button");
    if (dLink) setTimeout(() => closeAllHeaderDropdowns(), 100);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeAllHeaderDropdowns();
      closeMobileMenu();
      const nd = document.getElementById("notification-dropdown");
      if (nd && !nd.classList.contains("hidden")) {
        nd.classList.add("hidden");
        showingAllNotifications = false;
      }
      window.closeNotificationDetail();
    }
  });
  document
    .getElementById("notification-detail-modal")
    ?.addEventListener("click", function (e) {
      if (e.target === this) window.closeNotificationDetail();
    });

  const mobileOverlay = document.getElementById("mobile-overlay");
  if (mobileOverlay)
    mobileOverlay.addEventListener("click", () => window.toggleMobileMenu());
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      const sidebar = document.getElementById("sidebar");
      if (
        sidebar &&
        sidebar.classList.contains("translate-x-0") &&
        window.innerWidth < 1024
      )
        window.toggleMobileMenu();
    });
  });
  window.addEventListener("resize", () => {
    const sidebar = document.getElementById("sidebar"),
      overlay = document.getElementById("mobile-overlay");
    if (window.innerWidth >= 1024 && sidebar) {
      sidebar.classList.remove("translate-x-0");
      sidebar.classList.add("-translate-x-full");
      if (overlay) overlay.classList.add("hidden");
      document.body.style.overflow = "";
    }
  });

  showLoading("Securing session...");
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await user.reload();
      if (!user.emailVerified) {
        clearUserSession();
        loggedInUser = null;
        stopSessionHeartbeat();
        document.getElementById("auth-screen")?.classList.remove("hidden");
        document.getElementById("dashboard")?.classList.add("hidden");
        hideNotificationBell();
        await signOut(auth);
        hideLoading();
        return;
      }
      try {
        // Server read: never restore a session from a stale cached profile.
        let snap;
        try {
          snap = await getDocFromServer(doc(db, "residents", user.uid));
        } catch (netErr) {
          clearUserSession();
          loggedInUser = null;
          stopSessionHeartbeat();
          await signOut(auth);
          document.getElementById("auth-screen")?.classList.remove("hidden");
          document.getElementById("dashboard")?.classList.add("hidden");
          hideNotificationBell();
          renderPublicEvents();
          hideLoading();
          window.showAlert(
            "Connection Required",
            "We could not verify your account status. Please reconnect and sign in again.",
            "error",
          );
          return;
        }

        // A soft-deleted profile still exists, so also treat a MISSING
        // document as a hard delete and refuse the session.
        if (snap.exists()) {
          const ud = snap.data();
          // Refuse to restore a session for a disabled or archived account.
          if (isAccountDisabled(ud)) {
            const wasDeleted =
              ud.isDeleted === true || ud.accountStatus === "Deleted";
            clearUserSession();
            loggedInUser = null;
            stopSessionHeartbeat();
            await signOut(auth);
            document.getElementById("auth-screen")?.classList.remove("hidden");
            document.getElementById("dashboard")?.classList.add("hidden");
            hideNotificationBell();
            renderPublicEvents();
            hideLoading();
            window.showAlert(
              wasDeleted ? "Account Deleted" : "Account Disabled",
              accountLockMessage(ud),
              "error",
            );
            return;
          }
          const ss = localStorage.getItem("barangayUser");
          if (ss) {
            try {
              const ps = JSON.parse(ss);
              if (!currentSessionToken && ud.sessionToken)
                currentSessionToken = ud.sessionToken;
            } catch (e) {}
          }
          loggedInUser = { id: snap.id, ...ud };
          saveUserSession(loggedInUser);
          const se = sessionStorage.getItem("registeredEvents");
          if (se)
            try {
              registeredEventIds = new Set(JSON.parse(se));
            } catch (e) {
              registeredEventIds = new Set();
            }
          const sc = sessionStorage.getItem("completedEvents");
          if (sc)
            try {
              completedEventIds = new Set(JSON.parse(sc));
            } catch (e) {
              completedEventIds = new Set();
            }
          document.getElementById("auth-screen")?.classList.add("hidden");
          document.getElementById("dashboard")?.classList.remove("hidden");
          showNotificationBell();
          updateUIWithUserData(loggedInUser);
          await setUserStatus(loggedInUser.id, true);
          startSessionHeartbeat(loggedInUser.id);
          watchAccountStatus(loggedInUser.id);
          initUserHourTracker();
          await loadUserRegisteredEvents();
          setupParticipantsListener();
          initializeAllUserListeners();
          initNotificationsListener();
          renderEvents();
          setTimeout(() => window.switchTab(getSavedActiveTab()), 400);
        } else {
          clearUserSession();
          stopSessionHeartbeat();
          await signOut(auth);
          hideLoading();
        }
      } catch (e) {
        hideLoading();
      }
    } else {
      clearUserSession();
      loggedInUser = null;
      stopSessionHeartbeat();
      document.getElementById("auth-screen")?.classList.remove("hidden");
      document.getElementById("dashboard")?.classList.add("hidden");
      hideNotificationBell();
      renderPublicEvents();
      hideLoading();
    }
  });
});

window.addEventListener("beforeunload", () => {
  if (loggedInUser?.id) {
    sessionStorage.setItem(
      "registeredEvents",
      JSON.stringify([...registeredEventIds]),
    );
    sessionStorage.setItem(
      "completedEvents",
      JSON.stringify([...completedEventIds]),
    );
    setUserStatus(loggedInUser.id, false);
  }
  stopSessionHeartbeat();
  if (participantsUnsubscribe) participantsUnsubscribe();
  if (notificationsUnsubscribe) notificationsUnsubscribe();
  if (donationsUnsubscribe) donationsUnsubscribe();
  if (volunteersUnsubscribe) volunteersUnsubscribe();
  if (hoursUnsubscribe) hoursUnsubscribe();
});

// ===== LOGOUT =====
window.triggerLogoutConfirmation = function () {
  window.showConfirmPopup("Log Out", "Are you sure?", async () => {
    showLoading("Logging out...");
    stopSessionHeartbeat();
    if (loggedInUser?.id) {
      // setUserStatus already refuses to write to an archived/disabled
      // profile. Only clear the token when the account is still in good
      // standing, otherwise we would wipe the admin's revocation and let a
      // deleted account log back in.
      await setUserStatus(loggedInUser.id, false);
      try {
        const check = await getDocFromServer(
          doc(db, "residents", loggedInUser.id),
        );
        if (check.exists() && !isAccountDisabled(check.data())) {
          await updateDoc(doc(db, "residents", loggedInUser.id), {
            sessionToken: null,
            isOnline: false,
            lastActive: serverTimestamp(),
          });
        }
      } catch (e) {}
    }
    if (accountStatusUnsubscribe) {
      accountStatusUnsubscribe();
      accountStatusUnsubscribe = null;
    }
    await signOut(auth);
    clearUserSession();
    loggedInUser = null;
    currentSessionToken = null;
    document.getElementById("login-form")?.reset();
    document.getElementById("register-form")?.reset();
    document.getElementById("login-panel")?.classList.remove("hidden");
    document.getElementById("register-panel")?.classList.add("hidden");
    document.getElementById("auth-screen")?.classList.remove("hidden");
    document.getElementById("dashboard")?.classList.add("hidden");
    hideNotificationBell();
    renderPublicEvents();
    closeMobileMenu();
    if (alertTimeout) clearTimeout(alertTimeout);
    if (participantsUnsubscribe) participantsUnsubscribe();
    if (notificationsUnsubscribe) notificationsUnsubscribe();
    if (donationsUnsubscribe) donationsUnsubscribe();
    if (volunteersUnsubscribe) volunteersUnsubscribe();
    if (hoursUnsubscribe) hoursUnsubscribe();
    hideLoading();
    showLogoutBanner();
  });
};

function showLogoutBanner() {
  const eb = document.getElementById("logout-banner");
  if (eb) eb.remove();
  const b = document.createElement("div");
  b.id = "logout-banner";
  b.className =
    "fixed top-0 left-0 right-0 z-[300] transform -translate-y-full transition-transform duration-500 ease-in-out";
  b.innerHTML = `<div class="bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-6 py-4 shadow-2xl"><div class="max-w-4xl mx-auto flex items-center justify-between"><div class="flex items-center space-x-3"><div class="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center"><i class="fa-solid fa-circle-check text-white text-lg"></i></div><div><h3 class="font-extrabold text-sm">Successfully Logged Out</h3><p class="text-xs text-emerald-100 mt-0.5">You have been securely signed out.</p></div></div><button onclick="closeLogoutBanner()" class="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10"><i class="fa-solid fa-xmark text-sm"></i></button></div></div>`;
  document.body.appendChild(b);
  setTimeout(() => {
    b.classList.remove("-translate-y-full");
    b.classList.add("translate-y-0");
  }, 100);
  setTimeout(() => {
    closeLogoutBanner();
  }, 7000);
}

window.closeLogoutBanner = function () {
  const b = document.getElementById("logout-banner");
  if (b) {
    b.classList.add("-translate-y-full");
    b.classList.remove("translate-y-0");
    setTimeout(() => b.remove(), 500);
  }
};

// Replace the existing payment-modal-close event listener with this:

document
  .getElementById("payment-modal-close")
  ?.addEventListener("click", function (e) {
    // Prevent event bubbling
    e.preventDefault();
    e.stopPropagation();

    // Reset payment form data
    currentDonationData = null;
    selectedPaymentMethod = null;

    // Reset payment form
    const paymentForm = document.getElementById("payment-form");
    if (paymentForm) paymentForm.reset();

    // Remove selected class from payment method buttons
    document
      .querySelectorAll(".payment-method-btn")
      .forEach((b) => b.classList.remove("selected"));

    // Hide QR code container
    const qr = document.getElementById("qr-code-container");
    if (qr) qr.classList.add("hidden");

    // Hide cash password section, screenshot section and their confirm buttons
    const pwdSection = document.getElementById("payment-password-section");
    if (pwdSection) pwdSection.classList.add("hidden");
    const cashBtn = document.getElementById("payment-cash-confirm-btn");
    if (cashBtn) cashBtn.classList.add("hidden");
    const screenshotSection = document.getElementById("payment-screenshot-section");
    if (screenshotSection) screenshotSection.classList.add("hidden");
    const screenshotBtn = document.getElementById("payment-submit-screenshot-btn");
    if (screenshotBtn) screenshotBtn.classList.add("hidden");

    // Hide the modal directly
    const modal = document.getElementById("payment-modal");
    if (modal) {
      modal.classList.add("hidden");
    }

    // Restore body scroll
    document.body.style.overflow = "";
  });
document
  .getElementById("payment-modal")
  ?.addEventListener("click", function (e) {
    if (e.target === this) {
      currentDonationData = null;
      selectedPaymentMethod = null;
      document.getElementById("payment-form")?.reset();
      document
        .querySelectorAll(".payment-method-btn")
        .forEach((b) => b.classList.remove("selected"));
      this.classList.add("hidden");
      const qr = document.getElementById("qr-code-container");
      if (qr) qr.classList.add("hidden");
      const pwdSection = document.getElementById("payment-password-section");
      if (pwdSection) pwdSection.classList.add("hidden");
      const cashBtn = document.getElementById("payment-cash-confirm-btn");
      if (cashBtn) cashBtn.classList.add("hidden");
      const screenshotSection = document.getElementById("payment-screenshot-section");
      if (screenshotSection) screenshotSection.classList.add("hidden");
      const screenshotBtn = document.getElementById("payment-submit-screenshot-btn");
      if (screenshotBtn) screenshotBtn.classList.add("hidden");
    }
  });

// ===== EXPORT GLOBALS =====
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.openMobileMenu = openMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window.openNotificationDetail = window.openNotificationDetail;
window.closeNotificationDetail = window.closeNotificationDetail;
window.clearAllNotifications = window.clearAllNotifications;
window.joinEvent = window.confirmJoinEvent;
window.confirmJoinEvent = window.confirmJoinEvent;
window.performJoinEvent = performJoinEvent;
window.unregisterFromEvent = window.unregisterFromEvent;
window.selectPaymentMethod = window.selectPaymentMethod;
window.setAmount = window.setAmount;
window.processPayment = window.processPayment;
window.confirmCashPayment = window.confirmCashPayment;
window.submitPaymentWithScreenshot = window.submitPaymentWithScreenshot;
window.openPaymentModal = window.openPaymentModal;
window.formatTimeDisplay = formatTimeDisplay;
window.triggerProfilePicUpload = window.triggerProfilePicUpload;
window.handleProfilePicChange = window.handleProfilePicChange;
window.removeProfilePic = window.removeProfilePic;
window.toggleEditMode = window.toggleEditMode;
window.cancelEdit = window.cancelEdit;
window.saveProfileChanges = window.saveProfileChanges;
window.openAnnouncementDetails = window.openAnnouncementDetails;
window.handleRegisterClick = window.handleRegisterClick;
window.handleUnregisterClick = window.handleUnregisterClick;
window.handleSkillVerificationUpload = window.handleSkillVerificationUpload;
window.removeSkillVerification = window.removeSkillVerification;
window.toggleNotificationDropdown = window.toggleNotificationDropdown;
window.toggleMoreNotifications = window.toggleMoreNotifications;
window.markNotificationAsRead = window.markNotificationAsRead;
window.markAllNotificationsAsRead = window.markAllNotificationsAsRead;
window.handleNotificationClick = window.handleNotificationClick;
window.toggleMobileNotificationDropdown =
  window.toggleMobileNotificationDropdown;
window.toggleMoreMobileNotifications = window.toggleMoreMobileNotifications;
window.copyToClipboard = window.copyToClipboard;
window.downloadQRCode = window.downloadQRCode;
window.shareQRCode = window.shareQRCode;
window.handleForgotPassword = window.handleForgotPassword; // ADDED: Export forgot password function
window.switchDonationType = window.switchDonationType; // ADDED: Export donation type switcher
window.setDonationAmount = window.setDonationAmount; // ADDED: Export donation amount setter
