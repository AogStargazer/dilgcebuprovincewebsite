/**
 * menu.js - Handles the dynamic behavior of dropdown menus
 * 
 * This script manages the dropright submenus in the navigation,
 * providing different behaviors for desktop and mobile devices.
 * Supports both .has-drop-right and .has-dropright class naming conventions.
 * 
 * The script supports the hierarchical LGU menu structure with multiple levels:
 * - Legislative Districts (1st to 7th)
 * - Cities and Municipalities under each district
 * - Individual LGUs under each category
 */

/**
 * Checks if a submenu overflows the viewport and adjusts its position
 * @param {HTMLElement} item - The menu item containing the submenu
 * 
 * This function is critical for the hierarchical LGU menu to prevent
 * submenus from extending beyond the viewport. It automatically adds
 * the 'drop-left' class to reposition menus that would overflow.
 */
function checkSubmenuPosition(item) {
    // Select the appropriate submenu based on the parent class
    let submenu;
    if (item.classList.contains('has-drop-right')) {
        submenu = item.querySelector('.drop-right-menu');
    } else if (item.classList.contains('has-dropright')) {
        submenu = item.querySelector('.dropdown-menu');
    }
    
    if (!submenu) return;
    
    // Reset possible left repositioning
    item.classList.remove('drop-left');
    
    // Get submenu bounding rectangle
    const rect = submenu.getBoundingClientRect();
    
    // If the submenu overflows beyond the viewport width (with 10px buffer), add 'drop-left'
    if (rect.right > window.innerWidth - 10) {
        item.classList.add('drop-left');
    }
}

/**
 * Closes all open dropdown menus
 */
function closeAllDropdowns() {
    // Close all open dropright menus
    const openDroprightMenus = document.querySelectorAll('.has-dropright.open');
    openDroprightMenus.forEach(menu => {
        menu.classList.remove('open', 'drop-left');
    });
    
    // Close all open drop-right menus
    const openDropRightMenus = document.querySelectorAll('.has-drop-right.open');
    openDropRightMenus.forEach(menu => {
        menu.classList.remove('open', 'drop-left');
    });
}

/**
 * Initializes all dropdown menu items with appropriate event listeners
 * 
 * This function sets up both desktop (hover) and mobile (click) behaviors:
 * - On desktop: Menus open on hover and position is checked to prevent overflow
 * - On mobile: Menus open on click and use a stacked layout instead of flyout
 * 
 * The hierarchical LGU menu relies on this function to handle all interaction
 * for the Legislative Districts, Cities/Municipalities, and individual LGUs.
 */
function initDropRightMenus() {
    // Select both types of dropdown menu items
    const droprightItems = document.querySelectorAll('.has-dropright, .has-drop-right');
    
    droprightItems.forEach(item => {
        // Desktop events
        item.addEventListener('mouseenter', function() {
            // Only apply hover behavior on desktop
            if (window.innerWidth > 768) {
                item.classList.add('open');
                checkSubmenuPosition(item);
            }
        });
        
        item.addEventListener('mouseleave', function() {
            // Only apply hover behavior on desktop
            if (window.innerWidth > 768) {
                item.classList.remove('open', 'drop-left');
            }
        });

        // Mobile events - attach to the item itself
        item.addEventListener('click', function(e) {
            if (window.innerWidth <= 768) {
                // Find the direct link within this item
                const link = e.target.closest('a');
                
                // If we clicked on the link that has a submenu
                if (link && link.parentNode === item) {
                    e.preventDefault();
                    
                    // Toggle the open class
                    const wasOpen = item.classList.contains('open');
                    
                    // Close all other open menus first
                    closeAllDropdowns();
                    
                    // If this menu wasn't open before, open it now
                    if (!wasOpen) {
                        item.classList.add('open');
                        checkSubmenuPosition(item);
                    }
                    
                    e.stopPropagation();
                }
            }
        });
        
        // This event handling is essential for the hierarchical LGU menu structure
        // where we have multiple levels of nested menus (Legislative Districts → Cities/Municipalities → LGUs)
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
        // If the click wasn't inside either type of dropdown menu
        if (!e.target.closest('.has-dropright') && !e.target.closest('.has-drop-right')) {
            closeAllDropdowns();
        }
    });
    
    // Handle window resize to recheck positions
    window.addEventListener('resize', function() {
        // Check both types of open menus
        const openDroprightMenus = document.querySelectorAll('.has-dropright.open');
        openDroprightMenus.forEach(menu => {
            checkSubmenuPosition(menu);
        });
        
        const openDropRightMenus = document.querySelectorAll('.has-drop-right.open');
        openDropRightMenus.forEach(menu => {
            checkSubmenuPosition(menu);
        });
    });
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initDropRightMenus);

/**
 * Note on Hierarchical Menu Implementation:
 * 
 * The hierarchical LGU menu structure uses the following HTML pattern:
 * 
 * <li class="has-dropdown">
 *   <a href="#">LGU's</a>
 *   <ul class="dropdown-menu">
 *     <li class="has-drop-right">
 *       <a href="#">Legislative District</a>
 *       <ul class="drop-right-menu">
 *         <li class="has-drop-right">
 *           <a href="#">Cities/Municipalities</a>
 *           <ul class="drop-right-menu">
 *             <li><a href="#">Individual LGU</a></li>
 *             ...
 *           </ul>
 *         </li>
 *       </ul>
 *     </li>
 *   </ul>
 * </li>
 * 
 * This script handles all the interaction behavior for this structure.
 */
