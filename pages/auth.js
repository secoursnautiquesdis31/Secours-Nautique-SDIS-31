/**
 * auth.js — Garde d'authentification + utilitaires partagés
 * Importé par toutes les pages de l'application (sauf index.html)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection,
  addDoc, updateDoc, deleteDoc, getDocs, query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ──────────────────────────────────────────────
// CONFIG FIREBASE — même objet qu'index.html
// ──────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDALxymVqh-WmY6VARc-m6zOzyt5zFk66o",
        authDomain: "secours-nautique-31.firebaseapp.com",
        projectId: "secours-nautique-31",
        storageBucket: "secours-nautique-31.firebasestorage.app",
        messagingSenderId: "1013387329575",
        appId: "1:1013387329575:web:aa1148aedf7e3106bb4e02"
    };
const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

// ──────────────────────────────────────────────
// ÉTAT GLOBAL
// ──────────────────────────────────────────────
export let currentUser = null;   // objet Firebase Auth
export let currentProfile = null; // document Firestore users/{uid}

/**
 * Rôles : "admin" | "collab" | "user"
 * Droits : can(action)
 */
export const ROLES = {
  admin: {
    label: "Administrateur",
    badgeClass: "badge-admin",
    roleClass: "role-admin"
  },
  collab: {
    label: "Collaborateur",
    badgeClass: "badge-collab",
    roleClass: "role-collab"
  },
  user: {
    label: "Utilisateur",
    badgeClass: "badge-user",
    roleClass: "role-user"
  }
};

// Matrice de permissions
const PERMISSIONS = {
  admin: [
    "formation.manage", "formation.validate",
    "rh.read", "rh.write", "rh.delete",
    "technique.manage", "technique.approveRequest",
    "operationnel.manage",
    "ressources.manage",
    "users.manage"
  ],
  collab: [
    "formation.manage", "formation.validate",
    "rh.read", "rh.write",
    "technique.manage",
    "operationnel.read",
    "ressources.read"
  ],
  user: [
    "formation.register",
    "rh.readOwn",
    "technique.requestReplacement",
    "operationnel.read",
    "ressources.read"
  ]
};

export function can(action) {
  if (!currentProfile) return false;
  const perms = PERMISSIONS[currentProfile.role] || [];
  return perms.includes(action);
}

// ──────────────────────────────────────────────
// GARDE D'AUTHENTIFICATION
// Appelé en tête de chaque page protégée
// ──────────────────────────────────────────────
export function requireAuth(onReady) {
  console.log("Vérification de l'accès...");
  
  // On ne met pas de unsub() tout de suite pour laisser Firebase respirer
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      console.warn("Aucun utilisateur connecté. Redirection...");
      window.location.href = "../index.html";
      return;
    }

    try {
      console.log("Utilisateur Firebase détecté :", user.uid);
      
      // On cherche le document dans Firestore
      // VERIFIE BIEN : Ta collection s'appelle "users" (minuscule) ?
      const userDocRef = doc(db, "users", user.uid);
      const snap = await getDoc(userDocRef);

      if (snap.exists()) {
        currentUser = user;
        currentProfile = { uid: user.uid, ...snap.data() };
        console.log("Profil trouvé ! Bienvenue", currentProfile.email);
        
        hideLoader();
        buildSidebar();
        onReady(currentProfile);
      } else {
        // C'EST ICI QUE CA BLOQUE SOUVENT
        console.error("ERREUR : Le document n'existe pas dans la collection 'users' pour l'ID :", user.uid);
        alert("Accès refusé : Votre compte n'est pas enregistré dans la base de données Firestore.");
        await signOut(auth);
        window.location.href = "../index.html";
      }
    } catch (err) {
      console.error("Erreur lors de la récupération du profil :", err);
    }
  });
}
// ──────────────────────────────────────────────
// SIDEBAR DYNAMIQUE
// ──────────────────────────────────────────────
function buildSidebar() {
  const profile = currentProfile;

  // Avatar initiales
  const initials = profile.prenom && profile.nom
    ? (profile.prenom[0] + profile.nom[0]).toUpperCase()
    : profile.email.substring(0, 2).toUpperCase();

  const roleInfo = ROLES[profile.role] || ROLES.user;

  // Injecter les infos utilisateur
  const avatarEl = document.getElementById("userAvatar");
  const nameEl   = document.getElementById("userName");
  const roleEl   = document.getElementById("userRole");

  if (avatarEl) avatarEl.textContent = initials;
  if (nameEl)   nameEl.textContent   = profile.prenom && profile.nom
    ? `${profile.prenom} ${profile.nom}`
    : profile.email;
  if (roleEl) {
    roleEl.textContent  = roleInfo.label;
    roleEl.className    = `user-role ${roleInfo.roleClass}`;
  }

  // Masquer les items selon le rôle
  document.querySelectorAll("[data-requires]").forEach(el => {
    const required = el.dataset.requires;
    if (!can(required)) el.style.display = "none";
  });

  // Marquer l'item actif selon l'URL
  const currentPage = window.location.pathname.split("/").pop();
  document.querySelectorAll(".nav-item[data-page]").forEach(el => {
    if (el.dataset.page === currentPage) el.classList.add("active");
  });

  // Bouton déconnexion
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
      window.location.href = "../index.html";
    });
  }

  // Mobile sidebar toggle
  const hamburger = document.getElementById("hamburger");
  const sidebar   = document.querySelector(".sidebar");
  const overlay   = document.querySelector(".sidebar-overlay");

  if (hamburger && sidebar) {
    hamburger.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      overlay?.classList.toggle("open");
    });
    overlay?.addEventListener("click", () => {
      sidebar.classList.remove("open");
      overlay.classList.remove("open");
    });
  }
}

// ──────────────────────────────────────────────
// LOADER PAGE
// ──────────────────────────────────────────────
function showLoader() {
  const l = document.getElementById("pageLoader");
  if (l) l.classList.remove("hidden");
}

function hideLoader() {
  const l = document.getElementById("pageLoader");
  if (l) setTimeout(() => l.classList.add("hidden"), 300);
}

// ──────────────────────────────────────────────
// TOASTS
// ──────────────────────────────────────────────
export function toast(message, type = "info", duration = 3500) {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${message}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; }, duration);
  setTimeout(() => t.remove(), duration + 350);
}

// ──────────────────────────────────────────────
// MODAL HELPERS
// ──────────────────────────────────────────────
export function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add("open");
}

export function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove("open");
}

// Fermeture sur clic extérieur
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) {
    e.target.classList.remove("open");
  }
});

// ──────────────────────────────────────────────
// EXPORTS FIREBASE (réexportés pour les pages)
// ──────────────────────────────────────────────
export {
  db, auth, storage,
  signOut, // <--- Vérifie que le 'O' est majuscule ici
  doc, getDoc, collection, addDoc, updateDoc, deleteDoc,
  getDocs, query, where, orderBy, serverTimestamp,
  ref, uploadBytes, getDownloadURL, deleteObject
};
