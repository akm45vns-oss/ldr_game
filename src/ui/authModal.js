import {
  signIn,
  signUp,
  signOutUser,
  resetPassword,
  getCurrentUser,
  formatAuthError,
  isAuthReady
} from '../firebase/auth.js';
import { isFirebaseConfigured } from '../firebase/firebase.js';

export class AuthModal {
  constructor(game) {
    this.game = game;
    this.activeTab = "signin"; // "signin" | "register" | "forgot"
    this.errorMsg = "";
    this.successMsg = "";
    this.isLoading = false;
  }

  render() {
    const modal = document.getElementById("auth-modal");
    if (!modal) return;

    const user = getCurrentUser();
    const configured = isFirebaseConfigured();

    let contentHtml = "";

    if (!configured) {
      contentHtml = `
        <div class="modal-box glass-panel">
          <div class="modal-header">
            <h2>Player Account — Local Mode</h2>
            <button class="btn-close" id="btn-close-auth">✕</button>
          </div>
          <div class="item-card active-quest" style="margin-bottom:12px;">
            <div style="color:var(--accent-gold); font-weight:700; font-size:13px; margin-bottom:4px;">
              🏠 Offline / Local Mode Active
            </div>
            <div style="font-size:11px; color:var(--text-dim); line-height:1.45;">
              Firebase is not yet configured for this build. Your game progress, Heart Crystals, and memories are safely saved on your local device.
            </div>
          </div>
          <div style="font-size:11px; color:var(--text-dim); margin-bottom:16px;">
            To enable cloud saves and couple pairing, add your Firebase keys in <code>.env</code> or Vercel Environment Variables.
          </div>
          <div class="modal-actions">
            <button class="pixel-btn btn-action-accent" id="btn-auth-ok">Continue Local Play</button>
          </div>
        </div>
      `;
      modal.innerHTML = contentHtml;
      document.getElementById("btn-close-auth")?.addEventListener("click", () => modal.classList.add("hidden"));
      document.getElementById("btn-auth-ok")?.addEventListener("click", () => modal.classList.add("hidden"));
      return;
    }

    if (user) {
      // User is authenticated
      contentHtml = `
        <div class="modal-box glass-panel">
          <div class="modal-header">
            <h2>Player Account</h2>
            <button class="btn-close" id="btn-close-auth">✕</button>
          </div>
          <div class="item-card unlocked" style="margin-bottom:14px;">
            <div class="item-card-header">
              <span style="color:#67e8f9; font-weight:700;">✦ Authenticated Player</span>
              <span class="status-badge completed">ONLINE</span>
            </div>
            <div style="font-size:13px; font-weight:700; color:#fff; margin-top:4px;">
              ${user.displayName || user.email.split("@")[0]}
            </div>
            <div style="font-size:11px; color:var(--text-dim);">${user.email}</div>
            <div style="font-size:10px; color:#a1a1aa; margin-top:4px;">UID: ${user.uid.slice(0, 10)}...</div>
          </div>

          <div style="display:flex; gap:8px; margin-bottom:14px;">
            <button class="pixel-btn" id="btn-open-couple-from-auth" style="flex:1;">
              ♥ Couple Settings
            </button>
            <button class="pixel-btn" id="btn-auth-signout" style="color:#f43f5e; border-color:rgba(244,63,94,0.4);">
              Sign Out
            </button>
          </div>

          <div class="modal-actions">
            <button class="pixel-btn" id="btn-close-auth-bottom">Back to Game</button>
          </div>
        </div>
      `;
      modal.innerHTML = contentHtml;
      document.getElementById("btn-close-auth")?.addEventListener("click", () => modal.classList.add("hidden"));
      document.getElementById("btn-close-auth-bottom")?.addEventListener("click", () => modal.classList.add("hidden"));
      document.getElementById("btn-auth-signout")?.addEventListener("click", async () => {
        await signOutUser();
        this.render();
        if (this.game.cloudSave) this.game.cloudSave.cleanup();
        if (this.game.couple) this.game.couple.cleanup();
      });
      document.getElementById("btn-open-couple-from-auth")?.addEventListener("click", () => {
        modal.classList.add("hidden");
        if (this.game.modals) this.game.modals.openModal("couple-modal");
      });
      return;
    }

    // Unauthenticated: Sign In / Register / Reset Tabs
    const errorHtml = this.errorMsg
      ? `<div class="status-badge locked" style="display:block; padding:8px 12px; margin-bottom:12px; border-radius:6px; font-size:11px; line-height:1.4;">⚠️ ${this.errorMsg}</div>`
      : "";
    const successHtml = this.successMsg
      ? `<div class="status-badge completed" style="display:block; padding:8px 12px; margin-bottom:12px; border-radius:6px; font-size:11px; line-height:1.4;">✓ ${this.successMsg}</div>`
      : "";

    contentHtml = `
      <div class="modal-box glass-panel">
        <div class="modal-header">
          <h2>Player Account &amp; Cloud</h2>
          <button class="btn-close" id="btn-close-auth">✕</button>
        </div>

        <div style="display:flex; gap:6px; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px;">
          <button class="pixel-btn ${this.activeTab === 'signin' ? 'btn-active' : ''}" id="tab-auth-signin" style="flex:1; font-size:11px;">Sign In</button>
          <button class="pixel-btn ${this.activeTab === 'register' ? 'btn-active' : ''}" id="tab-auth-register" style="flex:1; font-size:11px;">Register</button>
          <button class="pixel-btn ${this.activeTab === 'forgot' ? 'btn-active' : ''}" id="tab-auth-forgot" style="flex:1; font-size:11px;">Forgot PW</button>
        </div>

        ${errorHtml}
        ${successHtml}

        <form id="form-auth" style="display:flex; flex-direction:column; gap:10px;">
          ${
            this.activeTab === "register"
              ? `<div>
                  <label style="font-size:10px; color:var(--text-dim); text-transform:uppercase; font-weight:700;">Adventurer Name</label>
                  <input type="text" id="input-auth-name" class="pixel-input" placeholder="e.g. Ayush" maxlength="20" style="width:100%; box-sizing:border-box; margin-top:3px;" />
                </div>`
              : ""
          }

          <div>
            <label style="font-size:10px; color:var(--text-dim); text-transform:uppercase; font-weight:700;">Email Address</label>
            <input type="email" id="input-auth-email" class="pixel-input" placeholder="player@example.com" required style="width:100%; box-sizing:border-box; margin-top:3px;" />
          </div>

          ${
            this.activeTab !== "forgot"
              ? `<div>
                  <label style="font-size:10px; color:var(--text-dim); text-transform:uppercase; font-weight:700;">Password</label>
                  <input type="password" id="input-auth-password" class="pixel-input" placeholder="At least 6 characters" required style="width:100%; box-sizing:border-box; margin-top:3px;" />
                </div>`
              : ""
          }

          <div style="margin-top:6px;">
            <button type="submit" class="pixel-btn btn-action-accent" id="btn-auth-submit" style="width:100%; padding:10px;" ${this.isLoading ? 'disabled' : ''}>
              ${this.isLoading ? "Please wait..." : this.activeTab === "signin" ? "Sign In ♥" : this.activeTab === "register" ? "Create Account ♥" : "Send Reset Email"}
            </button>
          </div>
        </form>

        <div style="margin-top:12px; text-align:center;">
          <button class="btn-text" id="btn-auth-guest" style="font-size:11px; color:var(--text-dim); background:none; border:none; cursor:pointer; text-decoration:underline;">
            Continue as Guest (Offline Local Play)
          </button>
        </div>
      </div>
    `;

    modal.innerHTML = contentHtml;

    // Event Bindings
    document.getElementById("btn-close-auth")?.addEventListener("click", () => modal.classList.add("hidden"));
    document.getElementById("btn-auth-guest")?.addEventListener("click", () => modal.classList.add("hidden"));

    document.getElementById("tab-auth-signin")?.addEventListener("click", () => {
      this.activeTab = "signin";
      this.errorMsg = "";
      this.successMsg = "";
      this.render();
    });
    document.getElementById("tab-auth-register")?.addEventListener("click", () => {
      this.activeTab = "register";
      this.errorMsg = "";
      this.successMsg = "";
      this.render();
    });
    document.getElementById("tab-auth-forgot")?.addEventListener("click", () => {
      this.activeTab = "forgot";
      this.errorMsg = "";
      this.successMsg = "";
      this.render();
    });

    const form = document.getElementById("form-auth");
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("input-auth-email")?.value;
      const password = document.getElementById("input-auth-password")?.value;
      const name = document.getElementById("input-auth-name")?.value;

      this.isLoading = true;
      this.errorMsg = "";
      this.successMsg = "";
      this.render();

      try {
        if (this.activeTab === "signin") {
          await signIn(email, password);
          this.successMsg = "Welcome back!";
          setTimeout(() => {
            modal.classList.add("hidden");
            if (this.game.couple) this.game.couple.init(getCurrentUser());
          }, 800);
        } else if (this.activeTab === "register") {
          await signUp(email, password, name);
          this.successMsg = "Account created successfully!";
          setTimeout(() => {
            modal.classList.add("hidden");
            if (this.game.couple) this.game.couple.init(getCurrentUser());
          }, 800);
        } else if (this.activeTab === "forgot") {
          await resetPassword(email);
          this.successMsg = "Password reset link sent to your email!";
        }
      } catch (err) {
        this.errorMsg = formatAuthError(err);
      } finally {
        this.isLoading = false;
        this.render();
      }
    });
  }
}
