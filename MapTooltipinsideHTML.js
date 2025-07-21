/**
 * Cebu Map Persistent Tooltip System
 * Creates a permanent info panel that updates when hovering different regions
 */

class CebuMapTooltipSystem {
  constructor() {
    this.tooltipData = {
      "ASTURIAS": {
        profile: "Asturias is one of the local government units in Cebu Province.",
        lguname: "Asturias",
        mayor: "To be updated",
        mayordesignation: "Mayor of Asturias",
        mayorImg: "images/mayor_asturias.jpg",
        lgoo: "To be updated",
        lgoodesignation: "LGOO of Asturias",
        lgooImg: "images/lgoo_asturias.jpg",
        lgoo2: "Second LGOO Name",
        lgoodesignation2: "Assistant LGOO of Asturias",
        lgooImg2: "images/lgoo2_asturias.jpg"
      },
      "BALAMBAN": {
        profile: "Balamban is one of the local government units in Cebu Province.",
        lguname: "Balamban",
        mayor: "To be updated",
        mayordesignation: "Mayor of Balamban",
        mayorImg: "images/mayor_balamban.jpg",
        lgoo: "To be updated",
        lgoodesignation: "LGOO of Balamban",
        lgooImg: "images/lgoo_balamban.jpg"
      },
      "BANTAYAN": {
        profile: "Bantayan is one of the local government units in Cebu Province.",
        lguname: "Bantayan",
        lgoo: "To be updated",
        lgoodesignation: "LGOO of Bantayan",
        lgooImg: "images/lgoo_bantayan.jpg"
      },
      "BOGOCITY": {
        profile: "Bogo City is one of the local government units in Cebu Province.",
        lguname: "Bogo City",
        mayor: "To be updated",
        mayordesignation: "Mayor of Bogo City",
        mayorImg: "images/mayor_bogocity.jpg",
        lgoo: "To be updated",
        lgoodesignation: "LGOO of Bogo City",
        lgooImg: "images/lgoo_bogocity.jpg",
        lgoo2: "Second LGOO Name",
        lgoodesignation2: "Assistant LGOO of Bogo City",
        lgooImg2: "images/lgoo2_bogocity.jpg"
      },
      "NAGACITY": {
        profile: "Nagacity is one of the local government units in Cebu Province.",
        lguname: "Naga City",
        mayor: "Ereko F. Muravida",
        mayordesignation: "City Mayor of Naga City",
        mayorImg: "image/mayornaga.png",
        lgoo: "EMMA JOYEVLYN V. CALVO",
        lgoodesignation: "CLGOO of Naga City",
        lgooImg: "organizationalchart/images/emma_joyevelyn_v_calvo_city_of_naga.png",
        lgoo2: "AILEEN GRACE B. ARGAWANON-PECA",
        lgoodesignation2: "Assistant Field Officer of Naga City",
        lgooImg2: "organizationalchart/images/AileenPeca_Naga.png"
      }
    };
    
    this.init();
  }

  createInfoPanel() {
    // Remove existing panel if any
    const existing = document.querySelector('#cebuMapInfoPanel');
    if (existing) existing.remove();

    const panelHTML = `
      <div id="cebuMapInfoPanel" style="
        position: fixed !important;
        left: 20px !important;
        top: calc(100px + 20px) !important;
        z-index: 2147483647 !important;
        display: block !important;
        background: white !important;
        color: black !important;
        padding: 20px !important;
        border: 1px solid #ddd !important;
        border-radius: 8px !important;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important;
        max-width: 380px !important;
        font-family: Arial, sans-serif !important;
        font-size: 14px !important;
        pointer-events: auto !important;
      ">
        <div style="text-align: center; color: #666; margin-bottom: 15px;">
          <small>Hover over a region to see information</small>
        </div>
        <h3 id="panelPlaceName" style="margin: 0 0 15px 0 !important; color: #333 !important; border-bottom: 1px solid #eee; padding-bottom: 10px;">Select a Region</h3>
        <p id="panelProfile" style="margin: 0 0 15px 0 !important; color: #555 !important; line-height: 1.4;">Click or hover over any region on the map to view detailed information about that area.</p>
        
        <div id="panelOfficials" style="display: none;">
          <div id="mayorSection" style="display: none; margin-bottom: 15px;">
            <div style="display: flex; gap: 15px; align-items: center; padding: 10px; background: #f9f9f9; border-radius: 6px;">
              <img id="panelMayorImg" src="" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; border: 2px solid #ddd;" />
              <div>
                <div id="panelMayorName" style="font-weight: bold; color: #333; margin-bottom: 4px;">Mayor Name</div>
                <span id="panelMayorDesignation" style="color: #555 !important; font-size: 13px;">Mayor Designation</span>
              </div>
            </div>
          </div>
          
          <div id="lgooSection" style="display: none; margin-bottom: 15px;">
            <div style="display: flex; gap: 15px; align-items: center; padding: 10px; background: #f9f9f9; border-radius: 6px;">
              <img id="panelLgooImg" src="" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; border: 2px solid #ddd;" />
              <div>
                <div id="panelLgooName" style="font-weight: bold; color: #333; margin-bottom: 4px;">LGOO Name</div>
                <span id="panelLgooDesignation" style="color: #555 !important; font-size: 13px;">LGOO Designation</span>
              </div>
            </div>
          </div>

          <div id="lgoo2Section" style="display: none;">
            <div style="display: flex; gap: 15px; align-items: center; padding: 10px; background: #f9f9f9; border-radius: 6px;">
              <img id="panelLgoo2Img" src="" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; border: 2px solid #ddd;" />
              <div>
                <div id="panelLgoo2Name" style="font-weight: bold; color: #333; margin-bottom: 4px;">LGOO 2 Name</div>
                <span id="panelLgoo2Designation" style="color: #555 !important; font-size: 13px;">LGOO 2 Designation</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', panelHTML);
    return document.querySelector('#cebuMapInfoPanel');
  }

  updatePanel(name, data) {
    const panel = document.querySelector('#cebuMapInfoPanel');
    if (!panel) return;

    // Update basic content
    document.querySelector('#panelPlaceName').textContent = data.lguname || name;
    document.querySelector('#panelProfile').textContent = data.profile;

    // Handle Mayor section - only show if mayor data exists
    const mayorSection = document.querySelector('#mayorSection');
    if (data.mayor && data.mayor.trim() !== '') {
      document.querySelector('#panelMayorImg').src = data.mayorImg || '';
      document.querySelector('#panelMayorName').textContent = data.mayor;
      document.querySelector('#panelMayorDesignation').textContent = data.mayordesignation || '';
      mayorSection.style.display = 'block';
    } else {
      mayorSection.style.display = 'none';
    }

    // Handle LGOO section - only show if lgoo data exists
    const lgooSection = document.querySelector('#lgooSection');
    if (data.lgoo && data.lgoo.trim() !== '') {
      document.querySelector('#panelLgooImg').src = data.lgooImg || '';
      document.querySelector('#panelLgooName').textContent = data.lgoo;
      document.querySelector('#panelLgooDesignation').textContent = data.lgoodesignation || '';
      lgooSection.style.display = 'block';
    } else {
      lgooSection.style.display = 'none';
    }

    // Handle LGOO2 section - only show if lgoo2 data exists
    const lgoo2Section = document.querySelector('#lgoo2Section');
    if (data.lgoo2 && data.lgoo2.trim() !== '') {
      document.querySelector('#panelLgoo2Img').src = data.lgooImg2 || '';
      document.querySelector('#panelLgoo2Name').textContent = data.lgoo2;
      document.querySelector('#panelLgoo2Designation').textContent = data.lgoodesignation2 || '';
      lgoo2Section.style.display = 'block';
    } else {
      lgoo2Section.style.display = 'none';
    }

    // Show officials container if any official data exists
    const hasAnyOfficials = (data.mayor && data.mayor.trim() !== '') || 
                           (data.lgoo && data.lgoo.trim() !== '') || 
                           (data.lgoo2 && data.lgoo2.trim() !== '');
    
    document.querySelector('#panelOfficials').style.display = hasAnyOfficials ? 'block' : 'none';
  }

  setupPathEvents() {
    const paths = document.querySelectorAll('svg path');
    
    paths.forEach((path) => {
      const title = path.querySelector('title');
      if (!title) return;

      const rawName = title.textContent.trim();
      const regionKey = rawName.replace(/\s+/g, "").toUpperCase();
      const data = this.tooltipData[regionKey];

      if (!data) return;

      // Style the interactive paths
      path.style.cssText += `
        cursor: pointer !important;
        transition: all 0.2s ease !important;
      `;

      // Add hover events - only update panel, never reset
      path.addEventListener('mouseenter', () => {
        this.updatePanel(rawName, data);
        path.style.opacity = '0.7';
        path.style.filter = 'brightness(1.1)';
      });

      path.addEventListener('mouseleave', () => {
        path.style.opacity = '';
        path.style.filter = '';
        // Panel data stays - no reset!
      });

      // Add click event for mobile/touch devices
      path.addEventListener('click', (e) => {
        this.updatePanel(rawName, data);
        e.preventDefault();
        e.stopPropagation();
      });
    });
  }

  init() {
    const doInit = () => {
      // Create persistent info panel
      this.createInfoPanel();
      
      // Setup path events
      this.setupPathEvents();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', doInit);
    } else {
      doInit();
    }
  }

  setTooltipData(data) {
    Object.assign(this.tooltipData, data);
    return this;
  }
}

// Initialize the system
const cebuMapTooltipSystem = new CebuMapTooltipSystem();
window.cebuMapTooltipSystem = cebuMapTooltipSystem;