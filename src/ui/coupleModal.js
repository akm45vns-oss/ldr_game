import { getCurrentUser } from '../firebase/auth.js';
import { isFirebaseConfigured } from '../firebase/firebase.js';

export class CoupleModal {
  constructor(game) {
    this.game = game;
    this.errorMsg = "";
    this.successMsg = "";
    this.isLoading = false;
  }

  render() {
    const modal = document.getElementById("couple-modal");
    if (!modal) return;

    const user = getCurrentUser();
    const coupleMgr = this.game.couple;
    const cloudMgr = this.game.cloudSave;

    let contentHtml = "";

    if (!isFirebaseConfigured()) {
      contentHtml = `
        <div class="modal-box glass-panel">
          <div class="modal-header">
            <h2>Couple Connection — Offline</h2>
            <button class="btn-close" id="btn-close-couple">✕</button>
          </div>
          <div class="item-card active-quest" style="margin-bottom:14px;">
            <div style="font-weight:700; color:var(--accent-gold); margin-bottom:4px;">🏠 Local Offline Mode</div>
            <div style="font-size:11px; color:var(--text-dim); line-height:1.45;">
              Firebase credentials are not configured in this environment. You can play 100% of the game locally with your partner beside you in solo/companion mode!
            </div>
          </div>
          <div class="modal-actions">
            <button class="pixel-btn btn-action-accent" id="btn-close-couple-bottom">Back to Game</button>
          </div>
        </div>
      `;
      modal.innerHTML = contentHtml;
      document.getElementById("btn-close-couple")?.addEventListener("click", () => modal.classList.add("hidden"));
      document.getElementById("btn-close-couple-bottom")?.addEventListener("click", () => modal.classList.add("hidden"));
      return;
    }

    if (!user) {
      contentHtml = `
        <div class="modal-box glass-panel">
          <div class="modal-header">
            <h2>Couple Connection</h2>
            <button class="btn-close" id="btn-close-couple">✕</button>
          </div>
          <div class="item-card locked" style="margin-bottom:14px;">
            <div style="color:#67e8f9; font-weight:700; margin-bottom:4px;">Sign In to Pair With Partner</div>
            <div style="font-size:11px; color:var(--text-dim); line-height:1.45;">
              To link your saves and share Heart Crystals and Scrapbook progress, please create or sign into your player account first.
            </div>
          </div>
          <div class="modal-actions" style="display:flex; gap:8px;">
            <button class="pixel-btn btn-action-accent" id="btn-open-auth-from-couple" style="flex:1;">
              Sign In / Register ♥
            </button>
            <button class="pixel-btn" id="btn-close-couple-bottom">Play Offline</button>
          </div>
        </div>
      `;
      modal.innerHTML = contentHtml;
      document.getElementById("btn-close-couple")?.addEventListener("click", () => modal.classList.add("hidden"));
      document.getElementById("btn-close-couple-bottom")?.addEventListener("click", () => modal.classList.add("hidden"));
      document.getElementById("btn-open-auth-from-couple")?.addEventListener("click", () => {
        modal.classList.add("hidden");
        if (this.game.modals) this.game.modals.openModal("auth-modal");
      });
      return;
    }

    const errorHtml = this.errorMsg
      ? `<div class="status-badge locked" style="display:block; padding:8px 12px; margin-bottom:12px; border-radius:6px; font-size:11px; line-height:1.4;">⚠️ ${this.errorMsg}</div>`
      : "";
    const successHtml = this.successMsg
      ? `<div class="status-badge completed" style="display:block; padding:8px 12px; margin-bottom:12px; border-radius:6px; font-size:11px; line-height:1.4;">✓ ${this.successMsg}</div>`
      : "";

    // Case 1: Already Linked with Partner
    if (coupleMgr && coupleMgr.isLinked) {
      const partner = coupleMgr.partnerProfile || {};
      const partnerName = partner.displayName || "Partner";
      const syncStatus = cloudMgr ? cloudMgr.statusMessage : "Online";

      contentHtml = `
        <div class="modal-box glass-panel">
          <div class="modal-header">
            <h2>♥ Linked Couple Adventure ♥</h2>
            <button class="btn-close" id="btn-close-couple">✕</button>
          </div>

          ${errorHtml}
          ${successHtml}

          <div class="item-card completed" style="margin-bottom:12px; text-align:center;">
            <div style="font-size:14px; font-weight:700; color:#ff4b8b;">
              ♥ You &amp; ${partnerName}
            </div>
            <div style="font-size:11px; color:var(--text-dim); margin-top:2px;">
              Connected Account: ${partner.email || "Active"}
            </div>
          </div>

          <div class="item-card unlocked" style="margin-bottom:14px;">
            <div class="item-card-header">
              <span>☁ Cloud Save Status</span>
              <span class="status-badge completed">ACTIVE</span>
            </div>
            <div style="font-size:11px; color:#67e8f9; margin-top:4px;">
              ${syncStatus}
            </div>
            <div style="font-size:10px; color:var(--text-dim); margin-top:2px;">
              Revision #${cloudMgr ? cloudMgr.localRevision : 1} • Crystals &amp; Scrapbook Shared
            </div>
          </div>

          <div style="display:flex; gap:8px; margin-bottom:12px;">
            <button class="pixel-btn btn-action-accent" id="btn-sync-now" style="flex:1;" ${this.isLoading ? 'disabled' : ''}>
              ${this.isLoading ? "Syncing..." : "🔄 Sync Now"}
            </button>
            <button class="pixel-btn" id="btn-unlink-couple" style="color:#f43f5e; border-color:rgba(244,63,94,0.4);">
              Unlink
            </button>
          </div>

          <div class="modal-actions">
            <button class="pixel-btn" id="btn-close-couple-bottom">Back to Game</button>
          </div>
        </div>
      `;
      modal.innerHTML = contentHtml;

      document.getElementById("btn-close-couple")?.addEventListener("click", () => modal.classList.add("hidden"));
      document.getElementById("btn-close-couple-bottom")?.addEventListener("click", () => modal.classList.add("hidden"));

      document.getElementById("btn-sync-now")?.addEventListener("click", async () => {
        this.isLoading = true;
        this.errorMsg = "";
        this.successMsg = "";
        this.render();
        try {
          if (cloudMgr) await cloudMgr.uploadLocalSave();
          this.successMsg = "Progress synchronized successfully!";
        } catch (e) {
          this.errorMsg = e.message || "Sync failed. Playing offline.";
        } finally {
          this.isLoading = false;
          this.render();
        }
      });

      document.getElementById("btn-unlink-couple")?.addEventListener("click", async () => {
        if (confirm("Are you sure you want to unlink from your partner? Your local progress will be preserved.")) {
          try {
            await coupleMgr.leaveCouple();
            this.render();
          } catch (e) {
            this.errorMsg = e.message;
            this.render();
          }
        }
      });
      return;
    }

    // Case 2: Couple Created, Waiting for Partner
    if (coupleMgr && coupleMgr.coupleId && coupleMgr.members.length === 1) {
      const inviteCode = coupleMgr.activeInvite ? coupleMgr.activeInvite.code : null;

      contentHtml = `
        <div class="modal-box glass-panel">
          <div class="modal-header">
            <h2>Couple Pairing</h2>
            <button class="btn-close" id="btn-close-couple">✕</button>
          </div>

          ${errorHtml}
          ${successHtml}

          <div class="item-card active-quest" style="margin-bottom:14px; text-align:center;">
            <div style="font-size:12px; color:var(--text-dim); margin-bottom:6px;">Your Secret Invitation Code</div>
            <div id="invite-code-display" style="font-size:22px; font-weight:800; letter-spacing:3px; color:#ffd166; background:rgba(0,0,0,0.4); padding:10px 16px; border-radius:8px; border:1px dashed #ffd166; user-select:all; display:inline-block;">
              ${inviteCode || "GENERATING..."}
            </div>
            <div style="font-size:10px; color:var(--text-dim); margin-top:8px;">
              Share this code with your partner. Expires in 24 hours. Single use.
            </div>
          </div>

          <div style="display:flex; gap:8px; margin-bottom:14px;">
            <button class="pixel-btn btn-action-accent" id="btn-copy-invite" style="flex:1;" ${!inviteCode ? 'disabled' : ''}>
              📋 Copy Code
            </button>
            <button class="pixel-btn" id="btn-regen-invite">
              🔄 New Code
            </button>
          </div>

          <div class="modal-actions">
            <button class="pixel-btn" id="btn-close-couple-bottom">Back to Game</button>
          </div>
        </div>
      `;
      modal.innerHTML = contentHtml;

      document.getElementById("btn-close-couple")?.addEventListener("click", () => modal.classList.add("hidden"));
      document.getElementById("btn-close-couple-bottom")?.addEventListener("click", () => modal.classList.add("hidden"));

      // Auto-generate invite code if not present
      if (!inviteCode && !this.isLoading) {
        this.isLoading = true;
        coupleMgr.createInvite()
          .catch((e) => { this.errorMsg = e.message; })
          .finally(() => {
            this.isLoading = false;
            this.render();
          });
      }

      document.getElementById("btn-copy-invite")?.addEventListener("click", () => {
        if (inviteCode && navigator.clipboard) {
          navigator.clipboard.writeText(inviteCode);
          this.successMsg = "Invitation code copied to clipboard!";
          this.render();
        }
      });

      document.getElementById("btn-regen-invite")?.addEventListener("click", async () => {
        this.isLoading = true;
        this.errorMsg = "";
        this.successMsg = "";
        this.render();
        try {
          await coupleMgr.createInvite();
          this.successMsg = "New invitation code generated!";
        } catch (e) {
          this.errorMsg = e.message;
        } finally {
          this.isLoading = false;
          this.render();
        }
      });
      return;
    }

    // Case 3: Signed in, but no couple created or joined yet
    contentHtml = `
      <div class="modal-box glass-panel">
        <div class="modal-header">
          <h2>Join or Create Couple</h2>
          <button class="btn-close" id="btn-close-couple">✕</button>
        </div>

        ${errorHtml}
        ${successHtml}

        <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:14px;">
          <!-- Card A: Create Couple -->
          <div class="item-card unlocked">
            <div class="item-card-header">
              <span style="color:#67e8f9; font-weight:700;">Option 1: Start Couple Adventure</span>
            </div>
            <div style="font-size:11px; color:var(--text-dim); margin-top:4px; line-height:1.4;">
              Create a unique couple room and generate an invitation code for your partner to join.
            </div>
            <div style="margin-top:10px;">
              <button class="pixel-btn btn-action-accent" id="btn-action-create-couple" style="width:100%;" ${this.isLoading ? 'disabled' : ''}>
                ${this.isLoading ? "Creating..." : "Create Couple &amp; Invite Partner ♥"}
              </button>
            </div>
          </div>

          <!-- Card B: Join Couple -->
          <div class="item-card active-quest">
            <div class="item-card-header">
              <span style="color:#ffd166; font-weight:700;">Option 2: Enter Partner's Code</span>
            </div>
            <div style="font-size:11px; color:var(--text-dim); margin-top:4px; line-height:1.4;">
              If your partner already created a couple, enter their 8-character invitation code below:
            </div>
            <form id="form-join-couple" style="display:flex; gap:8px; margin-top:10px;">
              <input type="text" id="input-invite-code" class="pixel-input" placeholder="PH-XXXX-XXXX" maxlength="14" style="flex:1; text-transform:uppercase; font-weight:700; letter-spacing:1px;" required />
              <button type="submit" class="pixel-btn" id="btn-action-join-couple" ${this.isLoading ? 'disabled' : ''}>
                Join ♥
              </button>
            </form>
          </div>
        </div>

        <div class="modal-actions">
          <button class="pixel-btn" id="btn-close-couple-bottom">Play Offline for Now</button>
        </div>
      </div>
    `;

    modal.innerHTML = contentHtml;

    document.getElementById("btn-close-couple")?.addEventListener("click", () => modal.classList.add("hidden"));
    document.getElementById("btn-close-couple-bottom")?.addEventListener("click", () => modal.classList.add("hidden"));

    document.getElementById("btn-action-create-couple")?.addEventListener("click", async () => {
      this.isLoading = true;
      this.errorMsg = "";
      this.successMsg = "";
      this.render();
      try {
        await coupleMgr.createCouple();
        await coupleMgr.createInvite();
        this.successMsg = "Couple created! Share the code with your partner.";
      } catch (e) {
        this.errorMsg = e.message || "Failed to create couple.";
      } finally {
        this.isLoading = false;
        this.render();
      }
    });

    const joinForm = document.getElementById("form-join-couple");
    joinForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const code = document.getElementById("input-invite-code")?.value;
      this.isLoading = true;
      this.errorMsg = "";
      this.successMsg = "";
      this.render();
      try {
        await coupleMgr.redeemInvite(code);
        if (cloudMgr) await cloudMgr.uploadLocalSave();
        this.successMsg = "Connected to couple successfully!";
      } catch (err) {
        this.errorMsg = err.message || "Failed to join couple with this code.";
      } finally {
        this.isLoading = false;
        this.render();
      }
    });
  }
}
