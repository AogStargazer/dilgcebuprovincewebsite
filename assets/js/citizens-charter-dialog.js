(function () {
  const BUTTON_SELECTOR = ".citizens-charter-button";
  const BUTTON_HELP_TITLE = "Need help with DILG services?";
  const BUTTON_HELP_TEXT = "Click here to find the right guide.";
  const EXISTING_DIALOG_ID = "guideDialog";
  const DIALOG_ID = "sharedCitizenCharterDialog";
  const TOOLTIP_ID = "sharedCitizenCharterTooltip";
  const STYLE_ID = "sharedCitizenCharterDialogStyles";

  const services = [
    {
      title: "Foreign Travel Authority",
      description: "Authority to travel abroad for local government officials and employees.",
      href: "citizenscharter.html#external-01-foreign-travel-authority",
      image: "images/citizenscharter/ForeignTravelAuthority.png",
      keywords: "foreign travel authority local government officials employees travel abroad fta"
    },
    {
      title: "Full Disclosure Policy Certification",
      description: "Certification of compliance to FDP posting requirements.",
      href: "citizenscharter.html#external-02-full-disclosure-policy",
      image: "images/citizenscharter/FullDisclosurePolicyCertification.png",
      keywords: "full disclosure policy fdp certification compliance"
    },
    {
      title: "Barangay Officials Death and Burial Assistance",
      description: "Processing of BODBA claims and supporting documents.",
      href: "citizenscharter.html#external-07-bodba",
      image: "images/citizenscharter/BarangayOfficialsDeathandBurialAssistance.png",
      keywords: "barangay officials death burial assistance bodba"
    },
    {
      title: "Public Assistance and Complaints",
      description: "Guidance for public assistance and complaint handling.",
      href: "citizenscharter.html#external-14-public-assistance-complaints",
      image: "images/citizenscharter/PublicAssistanceandComplaints.png",
      keywords: "public assistance complaints citizen complaint help desk"
    },
    {
      title: "Certificate of Incumbency",
      description: "Request certification for incumbent local officials.",
      href: "citizenscharter.html#external-16-certificate-incumbency",
      image: "images/citizenscharter/CertificateofIncumbency.png",
      keywords: "certificate of incumbency local officials coi"
    },
    {
      title: "Access to Documents and Records",
      description: "Request access to available DILG documents, records, or information.",
      href: "citizenscharter.html#external-34-access-documents-records-information",
      image: "images/citizenscharter/AccesstoDocumentsandRecords.png",
      keywords: "access documents records information request foi"
    },
    {
      title: "Leave Application",
      description: "Internal leave application requirements and processing.",
      href: "citizenscharter.html#internal-01-leave-application",
      image: "images/citizenscharter/LeaveApplication.png",
      keywords: "leave application internal employees"
    },
    {
      title: "Processing and Payment of Claims",
      description: "Requirements and steps for payment-related claims.",
      href: "citizenscharter.html#internal-09-processing-payment-claims",
      image: "images/citizenscharter/ProcessingandPaymentofClaims.png",
      keywords: "processing payment claims reimbursement finance"
    },
    {
      title: "Contact Information",
      description: "Find DILG offices and contact details listed in the handbook.",
      href: "citizenscharter.html#contact-information",
      image: "images/citizenscharter/ContactInformation.png",
      keywords: "contact information office directory phone regional provincial"
    }
  ];

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .shared-charter-dialog-layer{position:fixed;left:0;right:0;top:var(--shared-charter-dialog-top,0px);bottom:0;z-index:2147483000;background:rgba(15,23,42,.35);display:flex;align-items:flex-start;justify-content:center;padding:24px 0 24px}
      .shared-charter-dialog-layer[hidden]{display:none}
      .shared-charter-dialog{width:min(1740px,calc(100% - 160px));min-height:min(720px,calc(100vh - var(--shared-charter-dialog-top,0px) - 120px));max-height:100%;overflow:auto;background:#fff;border:1px solid #d0d7e2;border-radius:8px;box-shadow:0 18px 45px rgba(15,23,42,.18);font-family:Arial,system-ui,sans-serif}
      .shared-charter-dialog__head{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 22px;border-bottom:1px solid #d0d7e2;background:#fff}
      .shared-charter-dialog__intro{display:flex;align-items:center;gap:12px;min-width:0}
      .shared-charter-dialog__brand{width:80px;height:80px;flex:0 0 80px;object-fit:contain;padding:0;transform:scale(1.16);transform-origin:left center;margin:-12px 22px -12px 0}
      .shared-charter-dialog__head h2{font-size:24px;line-height:1.2;margin:0;color:#00245f}
      .shared-charter-dialog__head p{font-size:12px;line-height:1.35;color:#667085;margin:4px 0 0}
      .shared-charter-dialog__close{border:1px solid #d0d7e2;background:#fff;border-radius:8px;width:34px;height:34px;font-size:20px;line-height:1;cursor:pointer;color:#00245f}
      .shared-charter-dialog__body{padding:22px 28px 30px}
      .shared-charter-dialog__filter{width:100%;font:inherit;font-size:16px;border:1px solid #d0d7e2;border-radius:8px;padding:12px 14px;margin-bottom:14px}
      .shared-charter-dialog__list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
      .shared-charter-dialog__card{display:flex;align-items:center;gap:14px;border:1px solid #d0d7e2;border-radius:8px;padding:14px 15px;text-decoration:none;color:#111827;background:#fff;min-height:118px;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background-color .18s ease}
      .shared-charter-dialog__card:hover,.shared-charter-dialog__card:focus-visible{transform:translateY(-3px);border-color:#2f63d8;background:#f8fbff;box-shadow:0 12px 26px rgba(15,35,75,.14);outline:0}
      .shared-charter-dialog__icon{width:76px;height:76px;flex:0 0 76px;object-fit:contain;border-radius:8px;transition:transform .18s ease,filter .18s ease}
      .shared-charter-dialog__card:hover .shared-charter-dialog__icon,.shared-charter-dialog__card:focus-visible .shared-charter-dialog__icon{transform:scale(1.06);filter:drop-shadow(0 7px 10px rgba(15,35,75,.18))}
      .shared-charter-dialog__copy{display:block;min-width:0}
      .shared-charter-dialog__card strong{display:block;color:#00245f;font-size:13px;line-height:1.25}
      .shared-charter-dialog__desc{display:block;margin-top:4px;color:#667085;font-size:12px;line-height:1.3}
      .shared-charter-dialog__card[hidden]{display:none}
      .shared-charter-tooltip{position:fixed;z-index:2147483600;display:flex;align-items:center;gap:12px;width:min(310px,calc(100vw - 24px));border:1px solid #d0d7e2;border-radius:8px;padding:12px 13px;background:#fff;color:#111827;box-shadow:0 12px 26px rgba(15,35,75,.14);opacity:0;visibility:hidden;pointer-events:none;transform:translateY(6px);transition:opacity .16s ease,transform .16s ease,visibility .16s ease}
      .shared-charter-tooltip[data-open="true"]{opacity:1;visibility:visible;transform:translateY(0)}
      .shared-charter-tooltip__icon{width:54px;height:54px;flex:0 0 54px;object-fit:cover;border-radius:8px}
      .shared-charter-tooltip__copy{display:block;min-width:0}
      .shared-charter-tooltip strong{display:block;color:#00245f;font-size:13px;line-height:1.25}
      .shared-charter-tooltip span{display:block;margin-top:4px;color:#667085;font-size:12px;line-height:1.3}
      @media(max-width:900px){.shared-charter-dialog-layer{padding:14px 12px 24px}.shared-charter-dialog{width:100%;min-height:0}.shared-charter-dialog__list{grid-template-columns:1fr}.shared-charter-dialog__brand{width:56px;height:56px;flex-basis:56px;transform:scale(1.1);margin:-8px 12px -8px 0}.shared-charter-dialog__head h2{font-size:20px}}
    `;
    document.head.appendChild(style);
  }

  function createTooltip() {
    const existing = document.getElementById(TOOLTIP_ID);
    if (existing) {
      return existing;
    }

    const tooltip = document.createElement("div");
    tooltip.id = TOOLTIP_ID;
    tooltip.className = "shared-charter-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.innerHTML = `
      <img class="shared-charter-tooltip__icon" src="images/citizenscharterbutton.png" alt="" aria-hidden="true">
      <span class="shared-charter-tooltip__copy">
        <strong>${BUTTON_HELP_TITLE}</strong>
        <span>${BUTTON_HELP_TEXT}</span>
      </span>
    `;
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function positionTooltip(button, tooltip) {
    const rect = button.getBoundingClientRect();
    const gap = 10;
    const tooltipWidth = tooltip.offsetWidth || 310;
    const left = Math.min(Math.max(12, rect.right - tooltipWidth), window.innerWidth - tooltipWidth - 12);
    const top = Math.min(rect.bottom + gap, window.innerHeight - tooltip.offsetHeight - 12);

    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
  }

  function wireButtonTooltip(buttons) {
    const tooltip = createTooltip();

    buttons.forEach((button) => {
      button.removeAttribute("title");
      button.setAttribute("aria-describedby", TOOLTIP_ID);

      const show = () => {
        positionTooltip(button, tooltip);
        tooltip.dataset.open = "true";
      };
      const hide = () => {
        tooltip.dataset.open = "false";
      };

      button.addEventListener("mouseenter", show);
      button.addEventListener("focus", show);
      button.addEventListener("mouseleave", hide);
      button.addEventListener("blur", hide);
      button.addEventListener("click", hide);
    });

    window.addEventListener("resize", () => {
      const activeButton = document.querySelector(BUTTON_SELECTOR + ":hover," + BUTTON_SELECTOR + ":focus");
      if (activeButton && tooltip.dataset.open === "true") {
        positionTooltip(activeButton, tooltip);
      }
    });
  }

  function syncDialogOffset(dialog) {
    const header = document.querySelector(".main-header");
    const top = header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0;
    dialog.style.setProperty("--shared-charter-dialog-top", top + "px");
  }

  function createDialog() {
    const existing = document.getElementById(DIALOG_ID);
    if (existing) {
      return existing;
    }

    injectStyles();

    const layer = document.createElement("div");
    layer.className = "shared-charter-dialog-layer";
    layer.id = DIALOG_ID;
    layer.hidden = true;

    const cards = services.map((service) => `
      <a class="shared-charter-dialog__card" href="${service.href}" data-service="${service.keywords}">
        <img class="shared-charter-dialog__icon" src="${service.image}" alt="" loading="lazy">
        <span class="shared-charter-dialog__copy">
          <strong>${service.title}</strong>
          <span class="shared-charter-dialog__desc">${service.description}</span>
        </span>
      </a>
    `).join("");

    layer.innerHTML = `
      <section class="shared-charter-dialog" role="dialog" aria-modal="true" aria-labelledby="sharedCharterDialogTitle">
        <div class="shared-charter-dialog__head">
          <div class="shared-charter-dialog__intro">
            <img class="shared-charter-dialog__brand" src="images/citizenscharterbutton.png" alt="" aria-hidden="true">
            <div>
              <h2 id="sharedCharterDialogTitle">Welcome to the DILG Cebu Province Citizen's Charter</h2>
              <p>Utilize the Search Box and search what services you need in this esteemed agency.</p>
            </div>
          </div>
          <button class="shared-charter-dialog__close" type="button" aria-label="Close service finder">x</button>
        </div>
        <div class="shared-charter-dialog__body">
          <input class="shared-charter-dialog__filter" type="search" placeholder="Find services" aria-label="Find services">
          <div class="shared-charter-dialog__list">${cards}</div>
        </div>
      </section>
    `;

    document.body.appendChild(layer);
    return layer;
  }

  function openDialog(dialog) {
    syncDialogOffset(dialog);
    dialog.hidden = false;
    const filter = dialog.querySelector(".shared-charter-dialog__filter");
    if (filter) {
      filter.focus();
    }
  }

  function closeDialog(dialog) {
    dialog.hidden = true;
  }

  function wireSharedDialog(buttons) {
    const dialog = createDialog();
    const close = dialog.querySelector(".shared-charter-dialog__close");
    const filter = dialog.querySelector(".shared-charter-dialog__filter");
    const cards = Array.from(dialog.querySelectorAll(".shared-charter-dialog__card"));

    buttons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        openDialog(dialog);
      });
    });

    if (close) {
      close.addEventListener("click", () => closeDialog(dialog));
    }

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        closeDialog(dialog);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !dialog.hidden) {
        closeDialog(dialog);
      }
    });

    if (filter) {
      filter.addEventListener("input", () => {
        const query = filter.value.trim().toLowerCase();
        cards.forEach((card) => {
          const haystack = (card.textContent + " " + card.dataset.service).toLowerCase();
          card.hidden = Boolean(query) && !haystack.includes(query);
        });
      });
    }

    cards.forEach((card) => {
      card.addEventListener("click", () => closeDialog(dialog));
    });

    window.addEventListener("resize", () => syncDialogOffset(dialog));
    window.addEventListener("scroll", () => syncDialogOffset(dialog), { passive: true });
  }

  function init() {
    const buttons = Array.from(document.querySelectorAll(BUTTON_SELECTOR));
    if (!buttons.length) {
      return;
    }

    injectStyles();
    wireButtonTooltip(buttons);

    if (document.getElementById(EXISTING_DIALOG_ID)) {
      return;
    }

    wireSharedDialog(buttons);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
