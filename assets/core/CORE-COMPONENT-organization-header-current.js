// CORE-COMPONENT-organization-header-current.js
// Internal Version: 2026-06-13-110-A
// Purpose: Single shared organization header engine with controlled header/nav recipe modes. No page should render its own organization header.
// Usage: window.SyncEtcOrganizationHeader.render(containerOrId, context)

(function () {
  "use strict";

  const VERSION = "2026-06-13-110-A";
  const PUBLIC_ORDER = ["home", "about", "info", "aircraft", "calendar", "calendar-events", "events", "gallery", "documents", "documents-resources", "apply-now", "apply", "contact"];
  const USER_ORDER = ["member-dashboard", "user-dashboard", "dashboard", "my-profile", "profile", "roster", "member-roster", "member-documents", "user-documents", "gallery-submission", "submit-gallery"];
  const ADMIN_ORDER = ["organization-admin", "admin-dashboard", "organization-people", "people", "internal-documents", "board-documents", "admin-documents", "events-admin", "documents-admin", "gallery-admin", "aircraft-admin", "assets"];

  const PUBLIC_KEYS = new Set(PUBLIC_ORDER);
  const USER_KEYS = new Set(USER_ORDER);
  const ADMIN_KEYS = new Set(ADMIN_ORDER);
  const PROTECTED_KEY_ROW = {
    "member-dashboard": "user",
    "user-dashboard": "user",
    "dashboard": "user",
    "my-profile": "user",
    "profile": "user",
    "roster": "user",
    "member-roster": "user",
    "member-documents": "user",
    "user-documents": "user",
    "gallery-submission": "user",
    "submit-gallery": "user",
    "organization-admin": "admin",
    "admin-dashboard": "admin",
    "organization-people": "admin",
    "people": "admin",
    "internal-documents": "admin",
    "board-documents": "admin",
    "admin-documents": "admin",
    "events-admin": "admin",
    "documents-admin": "admin",
    "gallery-admin": "admin",
    "aircraft-admin": "admin",
    "assets": "admin"
  };
  const PLATFORM_ORDER = ["platform-access-tools", "access-admin", "customer-builder", "page-setup", "layout-designer"];

  function clean(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function key(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function obj(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function arr(value) {
    return Array.isArray(value) ? value : [];
  }

  function isHexColor(value) {
    return /^#[0-9a-f]{6}$/i.test(clean(value));
  }

  function hexToRgb(hex) {
    const value = clean(hex);
    if (!isHexColor(value)) throw new Error(`Invalid required color: ${value || "blank"}`);
    const c = value.replace("#", "");
    return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16) };
  }

  function rgba(hex, alpha) {
    const rgb = hexToRgb(hex);
    const a = Number.isFinite(Number(alpha)) ? Math.max(0, Math.min(1, Number(alpha))) : 1;
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
  }

  function firstText() {
    for (const value of arguments) {
      const text = clean(value);
      if (text) return text;
    }
    return "";
  }

  function styleError(message, missing) {
    return { ok: false, error: message, missing: arr(missing) };
  }

  function mapWidth(value) {
    const width = clean(value).toLowerCase();
    if (width === "narrow") return "880px";
    if (width === "normal" || width === "standard") return "1040px";
    if (width === "wide") return "1180px";
    if (/^\d+(px|rem|em|%)$/i.test(width)) return width;
    return "";
  }

  function mapRadius(effects, component) {
    const corners = clean(obj(effects).corners || obj(component).radius || obj(component).border_radius || "soft").toLowerCase();
    if (corners === "sharp") return "8px";
    if (corners === "pill") return "30px";
    if (/^\d+(px|rem|em|%)$/i.test(corners)) return corners;
    return "22px";
  }

  function mapShadow(effects, primary) {
    const shadows = clean(obj(effects).shadows || "soft").toLowerCase();
    if (shadows === "none") return "none";
    if (shadows === "hairline") return `0 1px 0 ${rgba(primary, 0.14)}`;
    if (shadows === "strong") return `0 24px 70px ${rgba(primary, 0.28)}`;
    return `0 14px 42px ${rgba(primary, 0.14)}`;
  }

  function normalizeStyle(context) {
    const styleProfile = obj(context.styleProfile || context.style || {});
    const colors = obj(styleProfile.colors_json || styleProfile.colors || {});
    const spacing = obj(styleProfile.spacing_json || styleProfile.spacing || {});
    const layout = obj(styleProfile.layout_json || styleProfile.layout || {});
    const effects = obj(styleProfile.effects_json || styleProfile.effects || {});
    const component = obj(styleProfile.component_json || styleProfile.component || {});

    const primary = firstText(colors.brand_primary, colors.primary, colors.brand);
    const secondary = firstText(colors.brand_secondary, colors.secondary);
    const surface = firstText(colors.surface);
    const text = firstText(colors.text);
    const rawWidth = firstText(spacing.page_width, layout.default_width, layout.page_width, layout.max_width);
    const pageWidth = mapWidth(rawWidth);

    const missing = [];
    if (!primary || !isHexColor(primary)) missing.push("colors_json.brand_primary");
    if (!secondary || !isHexColor(secondary)) missing.push("colors_json.brand_secondary");
    if (!surface || !isHexColor(surface)) missing.push("colors_json.surface");
    if (!text || !isHexColor(text)) missing.push("colors_json.text");
    if (!pageWidth) missing.push("spacing_json.page_width or layout_json.default_width");

    if (missing.length) {
      return styleError("STYLE CONFIGURATION ERROR: this organization header cannot render because the active organization style profile was not loaded or is incomplete.", missing);
    }

    return {
      ok: true,
      config: {
        primary,
        secondary,
        surface,
        text,
        soft: firstText(colors.soft, rgba(primary, 0.08)),
        border: firstText(colors.border, rgba(primary, 0.18)),
        pageWidth,
        radius: mapRadius(effects, component),
        shadow: mapShadow(effects, primary)
      }
    };
  }

  function normalizeLink(input, fallbackOrder) {
    const link = obj(input);
    const linkKey = key(link.key || link.page_key || link.template_key || link.slug || link.href || link.label);
    const href = clean(link.href || link.url || link.path || (linkKey === "home" ? "/" : `/${linkKey}`));
    const label = firstText(link.label, link.nav_label, link.title, link.template_name, link.page_name, linkKey === "home" ? "Home" : linkKey);
    const order = Number.isFinite(Number(link.order ?? link.nav_order ?? link.sort_order)) ? Number(link.order ?? link.nav_order ?? link.sort_order) : orderIndex(fallbackOrder, linkKey, 9999);
    const badgeCount = Number(link.badge_count ?? link.badgeCount ?? link.badge ?? 0);
    const badgeLabel = firstText(link.badge_label, link.badgeLabel, Number.isFinite(badgeCount) && badgeCount > 0 ? String(badgeCount) : "");
    return { key: linkKey, href, label, order, badge_count: Number.isFinite(badgeCount) ? badgeCount : 0, badge_label: badgeLabel };
  }

  function orderIndex(order, linkKey, fallback) {
    const index = arr(order).indexOf(key(linkKey));
    return index >= 0 ? (index + 1) * 10 : fallback;
  }

  function sortLinks(links, order) {
    return arr(links)
      .map((link) => normalizeLink(link, order))
      .filter((link) => link.key && link.href && link.label)
      .reduce((items, link) => {
        if (!items.some((item) => item.key === link.key || item.href === link.href)) items.push(link);
        return items;
      }, [])
      .sort((a, b) => {
        const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : 9999;
        const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : 9999;
        if (orderA !== orderB) return orderA - orderB;
        return String(a.label).localeCompare(String(b.label));
      });
  }

  function rowForKey(linkKey) {
    const k = key(linkKey);
    if (PUBLIC_KEYS.has(k)) return "public";
    if (USER_KEYS.has(k)) return "user";
    if (ADMIN_KEYS.has(k)) return "admin";
    if (PROTECTED_KEY_ROW[k]) return PROTECTED_KEY_ROW[k];
    return "unknown";
  }

  function filterLinksForRow(links, rowName) {
    return arr(links).filter((link) => {
      const lk = key(obj(link).key || obj(link).page_key || obj(link).template_key || obj(link).slug || obj(link).href || obj(link).label);
      const assigned = rowForKey(lk);
      if (rowName === "public") return assigned === "public";
      if (rowName === "user") return assigned === "user" || (assigned === "unknown" && clean(obj(link).nav_row || obj(link).nav_group || obj(link).row) === "user");
      if (rowName === "admin") return assigned === "admin" || (assigned === "unknown" && clean(obj(link).nav_row || obj(link).nav_group || obj(link).row) === "admin");
      return true;
    });
  }

  function ensureHome(publicLinks) {
    const links = sortLinks(publicLinks, PUBLIC_ORDER);
    if (!links.some((link) => link.key === "home" || link.href === "/")) {
      links.unshift({ key: "home", href: "/", label: "Home", order: 0 });
    }
    return links.sort((a, b) => {
      if (a.key === "home") return -1;
      if (b.key === "home") return 1;
      return (Number(a.order) || 9999) - (Number(b.order) || 9999) || a.label.localeCompare(b.label);
    });
  }

  function normalizeConfiguredNavigation(context) {
    const navigation = obj(context.navigation || {});
    const profile = obj(context.navigationProfile || navigation.profile || context.navigation_profile || {});
    const configuredRows = arr(context.navigationRows || navigation.rows || context.navigation_rows);
    const configuredItems = arr(context.navigationItems || navigation.items || context.navigation_items);
    if (!configuredRows.length && !configuredItems.length) return null;

    const access = obj(context.access || {});
    const authenticated = Boolean(context.authenticated ?? context.isAuthenticated ?? obj(context.auth).authenticated);
    const isUser = Boolean(access.can_view_user_dashboard || access.canViewUserDashboard || context.userVisible || authenticated);
    const isAdmin = Boolean(access.can_view_organization_admin || access.canViewOrganizationAdmin || context.adminVisible);
    const isSuperAdmin = Boolean(access.is_organization_super_admin || access.isOrganizationSuperAdmin || context.superAdmin);
    const isPlatform = Boolean(access.is_platform_admin || access.isPlatformAdmin || context.platformAdmin);

    const defaultRows = [
      { row_key: "public", row_label: "PUBLIC", sort_order: 10, visibility_rule: "always", is_enabled: true },
      { row_key: "user", row_label: "USER", sort_order: 20, visibility_rule: "authenticated_user", is_enabled: true },
      { row_key: "admin", row_label: "ADMIN", sort_order: 30, visibility_rule: "organization_admin", is_enabled: true },
      { row_key: "platform", row_label: "PLATFORM", sort_order: 40, visibility_rule: "platform_admin", is_enabled: true }
    ];
    const rowMap = new Map();
    for (const row of defaultRows.concat(configuredRows)) {
      const rowKey = key(obj(row).row_key || obj(row).key || obj(row).row || "public");
      if (!rowKey) continue;
      rowMap.set(rowKey, {
        key: rowKey,
        label: firstText(obj(row).row_label, obj(row).label, rowKey.toUpperCase()),
        order: Number(obj(row).sort_order || obj(row).order || 100),
        visibility: key(obj(row).visibility_rule || obj(row).visibility || (rowKey === "public" ? "always" : rowKey === "user" ? "authenticated_user" : rowKey === "admin" ? "organization_admin" : "platform_admin")),
        enabled: obj(row).is_enabled !== false && obj(row).enabled !== false,
      });
    }

    function rowIsVisible(row) {
      if (!row.enabled) return false;
      if (row.visibility === "hidden") return false;
      if (row.key === "public" || row.visibility === "always") return true;
      if (row.key === "platform" || row.visibility === "platform_admin") return authenticated && isPlatform;
      if (row.key === "admin" || row.visibility === "organization_admin") return authenticated && (isAdmin || isSuperAdmin || isPlatform);
      if (row.key === "user" || row.visibility === "authenticated_user") return authenticated && (isUser || isAdmin || isSuperAdmin || isPlatform);
      return authenticated;
    }

    const linksByRow = new Map();
    for (const itemRaw of configuredItems) {
      const item = obj(itemRaw);
      if (item.show_in_header === false || item.show === false) continue;
      const status = key(item.status || item.item_status || "published");
      if (["archived", "hidden", "disabled"].includes(status)) continue;
      const rowKey = key(item.row_key || item.nav_row || item.row || "public");
      if (!rowMap.has(rowKey)) rowMap.set(rowKey, { key: rowKey, label: rowKey.toUpperCase(), order: 100, visibility: rowKey === "public" ? "always" : "authenticated_user", enabled: true });
      const link = normalizeLink({
        key: item.item_key || item.key || item.page_key,
        page_key: item.page_key || item.item_key,
        href: item.href || item.url || item.path,
        label: item.nav_label || item.label || item.title,
        sort_order: item.sort_order ?? item.order ?? item.item_sort_order,
        badge_count: item.badge_count ?? item.badgeCount ?? item.badge,
        badge_label: item.badge_label ?? item.badgeLabel
      }, []);
      if (!link.key || !link.href || !link.label) continue;
      const list = linksByRow.get(rowKey) || [];
      list.push(link);
      linksByRow.set(rowKey, list);
    }

    const rowDefs = Array.from(rowMap.values())
      .filter(rowIsVisible)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || a.label.localeCompare(b.label))
      .map((row) => ({
        key: row.key,
        label: row.label,
        links: sortLinks(linksByRow.get(row.key) || [], []),
        className: row.key,
      }))
      .filter((row) => row.links.length);

    return {
      configured: true,
      profile,
      rowDefs,
      publicLinks: (rowDefs.find((r) => r.key === "public") || {}).links || [],
      userLinks: (rowDefs.find((r) => r.key === "user") || {}).links || [],
      adminLinks: (rowDefs.find((r) => r.key === "admin") || {}).links || [],
      platformLinks: (rowDefs.find((r) => r.key === "platform") || {}).links || [],
      authenticated,
      isUser,
      isAdmin,
      isSuperAdmin,
      isPlatform,
    };
  }

  function normalizeRows(context) {
    const configured = normalizeConfiguredNavigation(context);
    if (configured) return configured;

    const nav = obj(context.nav || context.navigation || {});
    const access = obj(context.access || {});
    const authenticated = Boolean(context.authenticated ?? context.isAuthenticated ?? obj(context.auth).authenticated);
    const isUser = Boolean(access.can_view_user_dashboard || access.canViewUserDashboard || context.userVisible || nav.user?.length);
    const isAdmin = Boolean(access.can_view_organization_admin || access.canViewOrganizationAdmin || context.adminVisible || nav.admin?.length);
    const isSuperAdmin = Boolean(access.is_organization_super_admin || access.isOrganizationSuperAdmin || context.superAdmin);
    const isPlatform = Boolean(access.is_platform_admin || access.isPlatformAdmin || context.platformAdmin || nav.platform?.length);

    const rawPublic = filterLinksForRow(nav.public || context.publicNavItems || context.publicLinks || [], "public");
    const rawUser = [
      ...filterLinksForRow(nav.user || context.userNavItems || context.userLinks || [], "user"),
      ...filterLinksForRow(nav.public || context.publicNavItems || context.publicLinks || [], "user")
    ];
    const rawAdmin = [
      ...filterLinksForRow(nav.admin || context.adminNavItems || context.adminLinks || [], "admin"),
      ...filterLinksForRow(nav.public || context.publicNavItems || context.publicLinks || [], "admin")
    ];

    const publicLinks = ensureHome(rawPublic);
    const userLinks = authenticated && (isUser || isAdmin || isSuperAdmin || isPlatform) ? sortLinks(rawUser, USER_ORDER) : [];
    const adminLinks = authenticated && (isAdmin || isSuperAdmin || isPlatform) ? sortLinks(rawAdmin, ADMIN_ORDER) : [];
    const platformLinks = authenticated && isPlatform ? sortLinks(nav.platform || context.platformNavItems || context.platformLinks || [], PLATFORM_ORDER) : [];

    return { publicLinks, userLinks, adminLinks, platformLinks, authenticated, isUser, isAdmin, isSuperAdmin, isPlatform };
  }

  function activePageKey(context) {
    const explicit = key(context.activePageKey || context.pageKey || context.currentPageKey);
    if (explicit) return explicit;
    const path = clean(location.pathname).replace(/^\/+/, "").replace(/\/+$/, "");
    return path ? key(path) : "home";
  }

  function logoHtml(context, organizationName, cfg) {
    const organization = obj(context.organization || {});
    const logo = obj(context.logo || organization.logo || organization.logo_json || {});
    const url = firstText(logo.url, logo.src, organization.logo_url, context.logoUrl);
    if (url) return `<img src="${esc(url)}" alt="${esc(firstText(logo.alt_text, organizationName, "Organization logo"))}" loading="lazy" decoding="async">`;
    const initials = clean(context.initials || organization.initials || organizationName || "S").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p.charAt(0)).join("").toUpperCase() || "S";
    return `<span class="syncetc-org-header-mark">${esc(initials)}</span>`;
  }

  function shouldShowOrgContextRow(context, rows) {
    const profile = obj(context.navigationProfile || context.navigation_profile || obj(context.navigation || {}).profile || rows?.profile || {});
    const orgs = arr(context.organizations || context.organizationOptions || context.availableOrganizations);
    if (orgs.length > 1) return true;
    if (context.showOrgContextRow === true || context.show_org_context_row === true) return true;
    if (profile.show_org_context_row === true || profile.showOrgContextRow === true) return true;
    return false;
  }

  function organizationSelectorHtml(context) {
    const orgs = arr(context.organizations || context.organizationOptions || context.availableOrganizations);
    const selected = clean(context.selectedOrganizationId || obj(context.organization).organization_id || context.organizationId);
    if (!orgs.length) return "";
    if (orgs.length === 1) {
      const org = obj(orgs[0]);
      return `<span class="syncetc-org-header-org-single">${esc(firstText(org.display_name, org.name, org.organization_name, context.organizationName))}${firstText(org.organization_key, org.key) ? `<small>${esc(firstText(org.organization_key, org.key))}</small>` : ""}</span>`;
    }
    return `<label class="syncetc-org-header-org-select"><span>Organization</span><select data-syncetc-org-select aria-label="Organization selector">${orgs.map((orgRaw) => {
      const org = obj(orgRaw);
      const id = clean(org.organization_id || org.id || org.customer_id);
      const name = firstText(org.display_name, org.name, org.organization_name, "Organization");
      const orgKey = firstText(org.organization_key, org.key, org.customer_key);
      return `<option value="${esc(id)}" ${id && id === selected ? "selected" : ""}>${esc(name)}${orgKey ? ` (${esc(orgKey)})` : ""}</option>`;
    }).join("")}</select></label>`;
  }

  function rowHtml(label, links, rowClass, context, forceLabel) {
    if (!links.length) return "";
    const active = activePageKey(context);
    const showLabel = forceLabel || label !== "PUBLIC" || normalizeRows(context).authenticated;
    return `<div class="syncetc-org-header-row ${esc(rowClass)} ${showLabel ? "" : "no-label"}">${showLabel ? `<span class="syncetc-org-header-row-label">${esc(label)}</span>` : ""}<nav>${links.map((link) => {
      const badge = clean(link.badge_label || (Number(link.badge_count || 0) > 0 ? String(link.badge_count) : ""));
      return `<a href="${esc(link.href)}" class="${key(link.key) === active ? "is-active" : ""}"><span>${esc(link.label)}</span>${badge ? `<span class="syncetc-org-header-badge">${esc(badge)}</span>` : ""}</a>`;
    }).join("")}</nav></div>`;
  }


  function normalizeRecipeKey(value) {
    const k = key(value || "standard-horizontal");
    if (["pill-rows", "standard", "standard-horizontal", "standard_horizontal"].includes(k)) return "standard-horizontal";
    if (["compact-pill-rows", "compact", "compact-horizontal", "compact_horizontal"].includes(k)) return "compact-horizontal";
    if (["two-row", "two_row", "rows", "stacked"].includes(k)) return "two-row";
    if (["dropdown", "dropdowns", "top-dropdowns", "top_dropdowns"].includes(k)) return "dropdowns";
    if (["minimal", "minimal-login-only", "minimal_login_only", "login-only"].includes(k)) return "minimal-login-only";
    if (["side-menu", "side_menu", "side-drawer", "side_drawer", "hamburger"].includes(k)) return "side-menu";
    if (["hybrid", "hybrid-top-and-side", "hybrid_top_and_side"].includes(k)) return "hybrid-top-and-side";
    return k || "standard-horizontal";
  }

  function normalizeNavDisplay(value, fallback) {
    const k = key(value || fallback || "inline-rows");
    if (["inline", "inline-rows", "rows", "pill-rows", "tabs"].includes(k)) return k === "tabs" ? "tabs" : "inline-rows";
    if (["dropdown", "dropdowns", "top-dropdowns"].includes(k)) return "dropdowns";
    if (["hamburger", "side", "side-menu", "side-drawer", "drawer"].includes(k)) return "side-drawer";
    return fallback || "inline-rows";
  }

  function boolSetting(settings, snake, camel, fallback) {
    if (Object.prototype.hasOwnProperty.call(settings, snake)) return settings[snake] === true;
    if (Object.prototype.hasOwnProperty.call(settings, camel)) return settings[camel] === true;
    return fallback;
  }

  function firstSetting(settings) {
    for (let i = 1; i < arguments.length; i += 1) {
      const name = arguments[i];
      if (Object.prototype.hasOwnProperty.call(settings, name) && clean(settings[name])) return clean(settings[name]);
    }
    return "";
  }

  function resolveHeaderRecipe(context, rows) {
    const navigation = obj(context.navigation || {});
    const profile = obj(context.navigationProfile || context.navigation_profile || navigation.profile || rows?.profile || {});
    const settings = {
      ...obj(profile.settings_json),
      ...obj(profile.header_settings_json),
      ...obj(context.headerSettings || context.header_settings)
    };
    const recipeKey = normalizeRecipeKey(firstText(profile.header_recipe_key, settings.header_recipe_key, profile.header_layout_key, settings.header_layout_key, "standard-horizontal"));
    const defaultDisplay = recipeKey === "dropdowns" ? "dropdowns" : ["side-menu", "minimal-login-only", "hybrid-top-and-side"].includes(recipeKey) ? "side-drawer" : "inline-rows";
    const navDisplayMode = normalizeNavDisplay(firstText(profile.nav_display_mode, settings.nav_display_mode), defaultDisplay);
    const sticky = boolSetting(settings, "sticky_header", "stickyHeader", false);
    const compact = recipeKey === "compact-horizontal" || boolSetting(settings, "compact_spacing", "compactSpacing", false);
    const showLogo = profile.show_logo !== false && boolSetting(settings, "show_logo", "showLogo", true) && recipeKey !== "minimal-login-only";
    const showOrgName = boolSetting(settings, "show_organization_name", "showOrganizationName", true);
    const showLoginButton = boolSetting(settings, "show_login_button", "showLoginButton", true);
    const showLogoutButton = profile.show_logout_button !== false && boolSetting(settings, "show_logout_button", "showLogoutButton", true);
    const showUserBadge = profile.show_user_badge !== false && boolSetting(settings, "show_user_badge", "showUserBadge", true) && recipeKey !== "minimal-login-only";
    return {
      key: recipeKey,
      navDisplayMode,
      sticky,
      compact,
      showLogo,
      showOrgName,
      showLoginButton,
      showLogoutButton,
      showUserBadge,
      alignment: key(firstSetting(settings, "alignment", "header_alignment") || "left"),
      titleMode: key(firstSetting(settings, "title_mode", "titleMode") || (profile.show_large_title === false ? "compact" : "large")),
      menuLabel: firstText(settings.menu_label, settings.menuLabel, "Menu"),
      version: firstText(profile.header_recipe_version, settings.header_recipe_version, "0108-A")
    };
  }

  function allRowDefs(rows, context) {
    if (Array.isArray(rows.rowDefs)) return rows.rowDefs;
    const out = [];
    if (arr(rows.publicLinks).length) out.push({ key: "public", label: "PUBLIC", links: rows.publicLinks, className: "public" });
    if (arr(rows.userLinks).length) out.push({ key: "user", label: "USER", links: rows.userLinks, className: "user" });
    if (arr(rows.adminLinks).length) out.push({ key: "admin", label: "ADMIN", links: rows.adminLinks, className: "admin" });
    if (arr(rows.platformLinks).length) out.push({ key: "platform", label: "PLATFORM", links: rows.platformLinks, className: "platform" });
    return out;
  }

  function rowDropdownHtml(row, context) {
    const links = arr(row.links);
    if (!links.length) return "";
    const active = activePageKey(context);
    const hasActive = links.some((link) => key(link.key) === active);
    return `<details class="syncetc-org-header-menu-group ${esc(row.className || row.key || "custom")}" ${hasActive ? "open" : ""}><summary>${esc(row.label || row.key || "Menu")}</summary><nav>${links.map((link) => {
      const badge = clean(link.badge_label || (Number(link.badge_count || 0) > 0 ? String(link.badge_count) : ""));
      return `<a href="${esc(link.href)}" class="${key(link.key) === active ? "is-active" : ""}"><span>${esc(link.label)}</span>${badge ? `<span class="syncetc-org-header-badge">${esc(badge)}</span>` : ""}</a>`;
    }).join("")}</nav></details>`;
  }

  function navRowsForRecipe(rowDefs, context, recipe) {
    const rows = arr(rowDefs);
    if (!rows.length) return "";
    if (recipe.navDisplayMode === "dropdowns") {
      return `<div class="syncetc-org-header-menu syncetc-org-header-menu--dropdowns">${rows.map((row) => rowDropdownHtml(row, context)).join("")}</div>`;
    }
    if (recipe.navDisplayMode === "side-drawer") {
      return `<button class="syncetc-org-header-menu-toggle" type="button" data-syncetc-header-menu-toggle aria-expanded="false"><span>${esc(recipe.menuLabel || "Menu")}</span></button><div class="syncetc-org-header-menu-overlay" data-syncetc-header-menu-overlay hidden></div><aside class="syncetc-org-header-drawer" data-syncetc-header-drawer aria-hidden="true"><div class="syncetc-org-header-drawer-head"><strong>${esc(recipe.menuLabel || "Menu")}</strong><button type="button" data-syncetc-header-menu-close aria-label="Close menu">×</button></div>${rows.map((row) => rowHtml(row.label, row.links || [], row.className || row.key || "custom", context, true)).join("")}</aside>`;
    }
    return rows.map((row) => rowHtml(row.label, row.links || [], row.className || row.key || "custom", context, true)).join("");
  }

  function css(cfg, recipe) {
    return `
      .syncetc-org-header{font-family:Arial,Helvetica,sans-serif;margin:0 auto;padding:12px 18px;max-width:${cfg.pageWidth};box-sizing:border-box;color:${cfg.text}}
      .syncetc-org-header *{box-sizing:border-box}.syncetc-org-header-card{display:grid;grid-template-columns:116px minmax(0,1fr);gap:10px;padding:10px;border-radius:${cfg.radius};background:rgba(255,255,255,.95);border:1px solid ${cfg.border};box-shadow:${cfg.shadow};backdrop-filter:blur(8px)}
      .syncetc-org-header-logo{display:flex;align-items:center;justify-content:center;border:1px solid ${cfg.border};border-radius:14px;background:${rgba(cfg.surface,.96)};min-height:96px;padding:10px}.syncetc-org-header-logo img{max-width:92px;max-height:92px;width:auto;height:auto;object-fit:contain;border-radius:12px}.syncetc-org-header-mark{width:72px;height:72px;border-radius:18px;background:linear-gradient(135deg,${cfg.primary},${rgba(cfg.primary,.72)});color:#fff;display:flex;align-items:center;justify-content:center;font-size:27px;font-weight:950;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
      .syncetc-org-header-main{display:grid;gap:7px;min-width:0}.syncetc-org-header-title-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 4px;min-width:0}.syncetc-org-header-title{min-width:0;color:${cfg.primary};font-size:clamp(20px,3vw,31px);font-weight:950;letter-spacing:-.035em;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .syncetc-org-header-auth{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;flex:0 0 auto}.syncetc-org-header-pill,.syncetc-org-header-auth-btn{display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:6px 11px;border-radius:999px;border:1px solid ${cfg.border};background:#fff;color:${cfg.primary}!important;text-decoration:none;font-size:12px;font-weight:950;white-space:nowrap}.syncetc-org-header-auth-btn{cursor:pointer;font-family:inherit}.syncetc-org-header-auth-btn:hover{background:${cfg.primary};color:#fff!important;transform:translateY(-1px)}.syncetc-org-header-pill.ok{background:#e7f6ec;color:#14532d!important;max-width:240px;overflow:hidden;text-overflow:ellipsis}.syncetc-org-header-pill.warn{background:#fff7ec;color:#8a4d00!important}
      .syncetc-org-header-context-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}.syncetc-org-header-org-select{display:block;position:relative;min-width:260px;max-width:460px;cursor:pointer}.syncetc-org-header-org-select span{display:none}.syncetc-org-header-org-select select{width:100%;min-height:34px;border:1px solid ${cfg.border};border-radius:999px;background:#fff;color:${cfg.primary};font-weight:950;padding:8px 34px 8px 12px;cursor:pointer}.syncetc-org-header-org-single{display:inline-flex;align-items:center;gap:8px;max-width:520px;border:1px solid ${cfg.border};background:${cfg.soft};color:${cfg.primary};border-radius:999px;padding:8px 12px;font-size:12px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.syncetc-org-header-org-single small{font-size:11px;color:${rgba(cfg.text,.58)};overflow:hidden;text-overflow:ellipsis}
      .syncetc-org-header-row{display:grid;grid-template-columns:92px minmax(0,1fr);gap:8px;align-items:center;min-height:34px;border:1px solid ${cfg.border};border-radius:999px;background:${rgba(cfg.surface,.95)};padding:4px 7px}.syncetc-org-header-row.no-label{grid-template-columns:1fr}.syncetc-org-header-row.public{background:rgba(255,255,255,.92)}.syncetc-org-header-row.user{background:${cfg.soft}}.syncetc-org-header-row.admin{background:${rgba(cfg.secondary,.68)}}.syncetc-org-header-row.platform{background:linear-gradient(90deg,rgba(6,31,78,.08),rgba(255,113,0,.08))}.syncetc-org-header-row-label{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;min-height:24px;padding:4px 9px;background:${cfg.primary};color:#fff;font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}.syncetc-org-header-row nav{display:flex;gap:7px;flex-wrap:wrap;align-items:center;justify-content:flex-end}.syncetc-org-header-row a{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:26px;padding:5px 10px;border-radius:999px;border:1px solid ${cfg.border};background:#fff;color:${cfg.primary}!important;text-decoration:none;font-size:11px;font-weight:950;white-space:nowrap}.syncetc-org-header-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:2px 6px;border-radius:999px;background:#b91c1c;color:#fff;font-size:10px;line-height:1;font-weight:950}.syncetc-org-header-row a:hover,.syncetc-org-header-row a.is-active{background:${cfg.primary};color:#fff!important;transform:translateY(-1px)}.syncetc-org-header-row a:hover .syncetc-org-header-badge,.syncetc-org-header-row a.is-active .syncetc-org-header-badge{background:#fff;color:${cfg.primary}}
      @media(max-width:900px){.syncetc-org-header-card{grid-template-columns:1fr}.syncetc-org-header-logo{min-height:72px}.syncetc-org-header-mark{width:56px;height:56px;font-size:23px}.syncetc-org-header-title-row{align-items:flex-start;flex-direction:column}.syncetc-org-header-auth{justify-content:flex-start}.syncetc-org-header-org-select,.syncetc-org-header-org-single{max-width:none;width:100%}.syncetc-org-header-row{grid-template-columns:1fr;border-radius:18px}.syncetc-org-header-row-label{justify-content:flex-start}.syncetc-org-header-row nav{justify-content:flex-start;align-items:stretch}.syncetc-org-header-row a,.syncetc-org-header-pill,.syncetc-org-header-auth-btn{flex:1 1 160px}}@media(max-width:620px){.syncetc-org-header{padding:10px}.syncetc-org-header-row a,.syncetc-org-header-pill,.syncetc-org-header-auth-btn{width:100%;flex-basis:100%}.syncetc-org-header-title{white-space:normal}}

      .syncetc-org-header--sticky{position:sticky;top:0;z-index:999}.syncetc-org-header--compact-horizontal .syncetc-org-header-card{grid-template-columns:76px minmax(0,1fr);padding:7px;gap:8px}.syncetc-org-header--compact-horizontal .syncetc-org-header-logo{min-height:62px}.syncetc-org-header--compact-horizontal .syncetc-org-header-logo img{max-width:58px;max-height:58px}.syncetc-org-header--compact-horizontal .syncetc-org-header-mark{width:48px;height:48px;border-radius:14px;font-size:20px}.syncetc-org-header--compact-horizontal .syncetc-org-header-title{font-size:clamp(17px,2.2vw,24px)}.syncetc-org-header--compact-horizontal .syncetc-org-header-row{min-height:29px;padding:3px 5px}.syncetc-org-header--compact-horizontal .syncetc-org-header-row a{min-height:23px;padding:4px 8px;font-size:10px}.syncetc-org-header--compact-horizontal .syncetc-org-header-row-label{min-height:21px;font-size:9px}
      .syncetc-org-header--two-row .syncetc-org-header-card{grid-template-columns:1fr}.syncetc-org-header--two-row .syncetc-org-header-logo{display:none}.syncetc-org-header--two-row .syncetc-org-header-title-row{border-bottom:1px solid ${cfg.border};padding-bottom:8px}.syncetc-org-header--two-row .syncetc-org-header-main{gap:9px}.syncetc-org-header--two-row .syncetc-org-header-row{border-radius:16px}.syncetc-org-header--two-row .syncetc-org-header-row nav{justify-content:flex-start}
      .syncetc-org-header--minimal-login-only .syncetc-org-header-card{display:block;padding:10px 14px}.syncetc-org-header--minimal-login-only .syncetc-org-header-main{display:flex;align-items:center;justify-content:space-between;gap:10px}.syncetc-org-header--minimal-login-only .syncetc-org-header-title-row{padding:0;flex:1}.syncetc-org-header--minimal-login-only .syncetc-org-header-title{font-size:clamp(16px,2.2vw,23px)}.syncetc-org-header--minimal-login-only .syncetc-org-header-logo,.syncetc-org-header--minimal-login-only .syncetc-org-header-context-row{display:none}.syncetc-org-header--minimal-login-only .syncetc-org-header-auth{margin-left:auto}
      .syncetc-org-header--align-center .syncetc-org-header-title-row{justify-content:center;text-align:center}.syncetc-org-header--align-center .syncetc-org-header-row nav{justify-content:center}.syncetc-org-header--align-right .syncetc-org-header-title-row{justify-content:flex-end;text-align:right}.syncetc-org-header--align-right .syncetc-org-header-row nav{justify-content:flex-end}.syncetc-org-header--hide-logo .syncetc-org-header-card{grid-template-columns:1fr}.syncetc-org-header--hide-logo .syncetc-org-header-logo{display:none}.syncetc-org-header--hide-title .syncetc-org-header-title{display:none}
      .syncetc-org-header-menu{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end}.syncetc-org-header-menu--dropdowns{border:1px solid ${cfg.border};border-radius:18px;background:${rgba(cfg.surface,.95)};padding:6px}.syncetc-org-header-menu-group{position:relative}.syncetc-org-header-menu-group summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-height:29px;padding:6px 12px;border-radius:999px;border:1px solid ${cfg.border};background:#fff;color:${cfg.primary};font-size:11px;font-weight:950}.syncetc-org-header-menu-group summary::-webkit-details-marker{display:none}.syncetc-org-header-menu-group[open] summary,.syncetc-org-header-menu-group summary:hover{background:${cfg.primary};color:#fff}.syncetc-org-header-menu-group nav{position:absolute;right:0;top:calc(100% + 6px);z-index:1003;min-width:210px;display:grid;gap:6px;border:1px solid ${cfg.border};border-radius:16px;background:#fff;padding:8px;box-shadow:${cfg.shadow}}.syncetc-org-header-menu-group nav a{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid ${cfg.border};border-radius:12px;background:#fff;color:${cfg.primary}!important;text-decoration:none;font-size:12px;font-weight:900;padding:8px 10px}.syncetc-org-header-menu-group nav a:hover,.syncetc-org-header-menu-group nav a.is-active{background:${cfg.primary};color:#fff!important}
      .syncetc-org-header-menu-toggle{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:7px 13px;border-radius:999px;border:1px solid ${cfg.border};background:${cfg.primary};color:#fff;font-family:inherit;font-weight:950;cursor:pointer}.syncetc-org-header-menu-toggle:hover{transform:translateY(-1px)}.syncetc-org-header-menu-overlay{position:fixed;z-index:1001;inset:0;background:rgba(0,0,0,.28)}.syncetc-org-header-drawer{position:fixed;z-index:1002;top:0;right:0;width:min(380px,92vw);height:100vh;overflow:auto;background:#fff;border-left:1px solid ${cfg.border};box-shadow:-18px 0 60px rgba(0,0,0,.22);padding:14px;transform:translateX(104%);transition:transform .18s ease}.syncetc-org-header-drawer.is-open{transform:translateX(0)}.syncetc-org-header-drawer-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 2px 12px;border-bottom:1px solid ${cfg.border};margin-bottom:12px;color:${cfg.primary}}.syncetc-org-header-drawer-head button{width:34px;height:34px;border-radius:999px;border:1px solid ${cfg.border};background:#fff;color:${cfg.primary};font-size:24px;line-height:1;cursor:pointer}.syncetc-org-header-drawer .syncetc-org-header-row{display:block;border-radius:18px;margin:0 0 10px}.syncetc-org-header-drawer .syncetc-org-header-row-label{margin-bottom:7px}.syncetc-org-header-drawer .syncetc-org-header-row nav{display:grid;justify-content:stretch}.syncetc-org-header-drawer .syncetc-org-header-row a{justify-content:space-between;width:100%;min-height:34px}
    `;
  }


  function renderRequiredStyleError(container, styleResult) {
    const missing = arr(styleResult?.missing);
    container.classList.add("syncetc-org-header");
    container.dataset.version = VERSION;
    container.dataset.styleError = "true";
    container.innerHTML = `
      <div style="box-sizing:border-box;max-width:1180px;margin:18px auto;padding:24px;border:6px solid #ff0000;background:#fff;color:#b00000;font-family:Arial,Helvetica,sans-serif;box-shadow:0 0 0 4px rgba(255,0,0,.18);">
        <div style="font-size:48px;line-height:1.02;font-weight:950;letter-spacing:-.04em;">STYLE CONFIGURATION ERROR</div>
        <div style="margin-top:12px;font-size:18px;line-height:1.35;font-weight:900;color:#7a0000;">This organization page cannot render its header because the active organization style profile was not loaded.</div>
        ${missing.length ? `<div style="margin-top:12px;font-size:14px;font-weight:800;color:#7a0000;">Missing or invalid: ${esc(missing.join(", "))}</div>` : ""}
        <div style="margin-top:12px;font-size:13px;color:#5f0000;">Version ${esc(VERSION)}. This is intentional: SyncEtc must not guess customer styling.</div>
      </div>`;
  }

  function render(target, contextRaw) {
    const context = obj(contextRaw);
    const container = typeof target === "string" ? document.getElementById(target) : target;
    if (!container) throw new Error("SyncEtcOrganizationHeader.render requires a valid container element or id.");

    const styleResult = normalizeStyle(context);
    if (!styleResult.ok) {
      renderRequiredStyleError(container, styleResult);
      return { version: VERSION, container, context, error: styleResult.error, missing: styleResult.missing };
    }
    const cfg = styleResult.config;
    const organization = obj(context.organization || {});
    const organizationName = firstText(context.organizationName, organization.display_name, organization.name, organization.organization_name, "SyncEtc User Portal");
    const rows = normalizeRows(context);
    const recipe = resolveHeaderRecipe(context, rows);
    const loginUrl = firstText(context.loginUrl, `/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    const email = firstText(context.email, obj(context.auth).email);
    const rowDefs = allRowDefs(rows, context);
    const navRowsHtml = navRowsForRecipe(rowDefs, context, recipe);
    const orgContextHtml = shouldShowOrgContextRow(context, rows) ? `<div class="syncetc-org-header-context-row">${organizationSelectorHtml(context)}</div>` : "";
    const authHtml = rows.authenticated
      ? `${recipe.showUserBadge ? `<span class="syncetc-org-header-pill ok">${esc(email || "Signed in")}</span>` : ""}${recipe.showLogoutButton ? `<button class="syncetc-org-header-auth-btn" data-syncetc-logout type="button">Log out</button>` : ""}`
      : `${recipe.showLoginButton ? `<a class="syncetc-org-header-auth-btn" data-syncetc-login href="${esc(loginUrl)}">Log in</a>` : ""}`;

    container.classList.add("syncetc-org-header", `syncetc-org-header--${recipe.key}`, `syncetc-org-header--nav-${recipe.navDisplayMode}`, `syncetc-org-header--align-${recipe.alignment || "left"}`);
    if (recipe.sticky) container.classList.add("syncetc-org-header--sticky");
    if (!recipe.showLogo) container.classList.add("syncetc-org-header--hide-logo");
    if (!recipe.showOrgName) container.classList.add("syncetc-org-header--hide-title");
    container.dataset.version = VERSION;
    container.dataset.headerRecipe = recipe.key;
    container.dataset.navDisplayMode = recipe.navDisplayMode;
    container.innerHTML = `<style>${css(cfg, recipe)}</style><div class="syncetc-org-header-card" data-version="${esc(VERSION)}" data-header-recipe="${esc(recipe.key)}" data-nav-display-mode="${esc(recipe.navDisplayMode)}"><div class="syncetc-org-header-logo">${logoHtml(context, organizationName, cfg)}</div><div class="syncetc-org-header-main"><div class="syncetc-org-header-title-row"><div class="syncetc-org-header-title">${esc(organizationName)}</div><span class="syncetc-org-header-auth">${authHtml}</span></div>${orgContextHtml}${navRowsHtml}</div></div>`;

    const onLogout = typeof context.onLogout === "function" ? context.onLogout : obj(context.callbacks).onLogout;
    const onLogin = typeof context.onLogin === "function" ? context.onLogin : obj(context.callbacks).onLogin;
    const onOrganizationChange = typeof context.onOrganizationChange === "function" ? context.onOrganizationChange : obj(context.callbacks).onOrganizationChange;

    container.querySelector("[data-syncetc-logout]")?.addEventListener("click", (event) => {
      event.preventDefault();
      if (typeof onLogout === "function") onLogout(event);
    });
    container.querySelector("[data-syncetc-login]")?.addEventListener("click", (event) => {
      if (typeof onLogin === "function") {
        event.preventDefault();
        onLogin(event);
      }
    });
    container.querySelector("[data-syncetc-org-select]")?.addEventListener("change", (event) => {
      if (typeof onOrganizationChange === "function") onOrganizationChange(event.target.value, event);
    });

    const drawer = container.querySelector("[data-syncetc-header-drawer]");
    const overlay = container.querySelector("[data-syncetc-header-menu-overlay]");
    const toggle = container.querySelector("[data-syncetc-header-menu-toggle]");
    function setDrawer(open) {
      if (!drawer || !overlay || !toggle) return;
      drawer.classList.toggle("is-open", Boolean(open));
      drawer.setAttribute("aria-hidden", open ? "false" : "true");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      overlay.hidden = !open;
    }
    toggle?.addEventListener("click", (event) => { event.preventDefault(); setDrawer(!drawer?.classList.contains("is-open")); });
    overlay?.addEventListener("click", () => setDrawer(false));
    container.querySelector("[data-syncetc-header-menu-close]")?.addEventListener("click", () => setDrawer(false));
    container.querySelectorAll(".syncetc-org-header-drawer a").forEach((link) => link.addEventListener("click", () => setDrawer(false)));
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") setDrawer(false); }, { once: false });

    return { version: VERSION, container, context, recipe };
  }

  window.SyncEtcOrganizationHeader = Object.freeze({
    VERSION,
    PUBLIC_ORDER: Object.freeze([...PUBLIC_ORDER]),
    USER_ORDER: Object.freeze([...USER_ORDER]),
    ADMIN_ORDER: Object.freeze([...ADMIN_ORDER]),
    PLATFORM_ORDER: Object.freeze([...PLATFORM_ORDER]),
    render,
    normalizeRows,
    normalizeStyle,
    resolveHeaderRecipe
  });
})();
