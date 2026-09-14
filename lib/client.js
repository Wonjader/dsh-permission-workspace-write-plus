window.__ModuleLoader__.load({
id: "dsh-permission-workspace-write-plus",
factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
var React = require("react");

// dsh-workspace-write-plus client plugin:
// 1. restores the access-mode glyph for the workspace-write-plus preset.
// 2. registers a dedicated Workspace Write Plus settings section.

// Workspace Write Plus glyph, built from the same 16px paths as the
// native workspace-write permission glyph, plus a small "+" badge at the
// top-right. Used in the conversation permission trigger/dropdown and in the
// settings nav; the settings permission row intentionally keeps no glyph.
var SVG_NS = 'http://www.w3.org/2000/svg';
var NATIVE_WORKSPACE_WRITE_PATHS = [
  'M8.08887 0.251709C8.20479 0.23085 8.32486 0.241168 8.43652 0.282959L15.0215 2.75171C15.2787 2.84819 15.4492 3.09414 15.4492 3.3689V7.0105C15.4492 7.10986 15.4441 7.2081 15.4414 7.30542C15.0285 7.07175 14.5905 6.87695 14.1309 6.73022V3.82495L8.20508 1.60327L2.2793 3.82495V7.0105C2.27936 9.7171 3.4745 11.5379 5.02734 12.7947C5.01025 12.9942 5 13.1962 5 13.4001C5.00001 13.7617 5.02722 14.1169 5.08008 14.4636C2.91555 13.0393 0.961014 10.752 0.960938 7.0105V3.3689C0.960938 3.09417 1.13146 2.84821 1.38867 2.75171L7.97461 0.282959L8.08887 0.251709Z',
  'M11.3525 5.64688V6.85688H5V5.64688H11.3525Z',
  'M9.5824 8.29376V9.50376H5V8.29376H9.5824Z',
  'M14.6647 15.6852H10.0338C10.3878 15.3751 10.7567 15.0517 11.0772 14.7706C11.2531 14.6164 11.4144 14.4746 11.5511 14.3547H14.6647V15.6852Z',
  'M8.14852 14.1308L7.33925 15.4976C7.22458 15.6912 7.42245 15.9194 7.63037 15.8333L9.09785 15.2254L15.0399 10.0719L14.0905 8.97733L8.14852 14.1308Z',
];

function workspaceWritePlusSvg(size) {
  var svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  for (var i = 0; i < NATIVE_WORKSPACE_WRITE_PATHS.length; i++) {
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', NATIVE_WORKSPACE_WRITE_PATHS[i]);
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
  }
  // Top-right "+" badge: a small background-coloured disc keeps the plus
  // visible on every theme, and the plus uses the same currentColor as the
  // native glyphs.
  var badge = document.createElementNS(SVG_NS, 'circle');
  badge.setAttribute('cx', '12.8');
  badge.setAttribute('cy', '3.1');
  badge.setAttribute('r', '2.35');
  badge.setAttribute('fill', 'var(--dsw-specific-menu, var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-2, #fff)))');
  svg.appendChild(badge);
  var plus = document.createElementNS(SVG_NS, 'path');
  plus.setAttribute('d', 'M12.8 1.85V4.35M11.55 3.1H14.05');
  plus.setAttribute('stroke', 'currentColor');
  plus.setAttribute('stroke-width', '1');
  plus.setAttribute('stroke-linecap', 'round');
  plus.setAttribute('fill', 'none');
  svg.appendChild(plus);
  return svg;
}

var CSS = "\n" +
  ".dsh-wwp-trigger-glyph {\n" +
  "  display: inline-flex;\n" +
  "  flex: 0 0 auto;\n" +
  "  width: 14px;\n" +
  "  height: 14px;\n" +
  "  align-items: center;\n" +
  "  justify-content: center;\n" +
  "  color: inherit;\n" +
  "}\n" +
  ".dsh-wwp-trigger-glyph svg {\n" +
  "  display: block;\n" +
  "  width: 14px;\n" +
  "  height: 14px;\n" +
  "}\n" +
  ".dsh-wwp-menu-glyph {\n" +
  "  display: inline-flex;\n" +
  "  flex: 0 0 auto;\n" +
  "  width: 16px;\n" +
  "  height: 16px;\n" +
  "  align-items: center;\n" +
  "  justify-content: center;\n" +
  "  color: var(--dsw-alias-label-tertiary);\n" +
  "}\n" +
  ".dsh-wwp-menu-glyph svg {\n" +
  "  display: block;\n" +
  "  width: 16px;\n" +
  "  height: 16px;\n" +
  "}\n" +
  ".dsh-wwp-nav-glyph {\n" +
  "  display: inline-flex;\n" +
  "  flex: 0 0 auto;\n" +
  "  width: 16px;\n" +
  "  height: 16px;\n" +
  "  align-items: center;\n" +
  "  justify-content: center;\n" +
  "  color: inherit;\n" +
  "}\n" +
  ".dsh-wwp-nav-glyph svg {\n" +
  "  display: block;\n" +
  "  width: 16px;\n" +
  "  height: 16px;\n" +
  "}\n";

var MENU_LABEL = "Workspace Write Plus";
var MENU_LABEL_ZH = "工作区内修改+";
// Elements that can carry a rendered permission label: the composer trigger,
// the composer/settings dropdown rows, and the /permission popup rows.
var LABEL_CANDIDATES = 'button, [role="menuitem"], [role="option"], [role="menuitemradio"]';
// The composer trigger also carries the name in its accessible label.
var LABEL_ATTRS = ['aria-label'];
var GLYPH_ATTR = "data-dsh-wwp-glyph";
var TRIGGER_ATTR = "data-dsh-wwp-trigger-glyph";
var NAV_ATTR = "data-dsh-wwp-nav-glyph";
var NAV_HIDDEN_ATTR = "data-dsh-wwp-nav-hidden";
var NS = "settings.workspace-write-plus";
var SETTINGS_NS = "workspace-write-plus";
var zh = {
"title": "工作区内修改+",
"description": "工作区写权限之外的附加放行与守护开关",
"loading": "加载中",
"unavailable": "不可用",
"error": "加载失败，点击重试",
"enabled.title": "启用工作区内修改+",
"enabled.desc": "关闭后本插件的所有附加放行与睡眠守护均不生效",
"allowConfigFiles.title": "工作区外配置类文件写入",
"allowConfigFiles.desc": "允许写工作区外、且工作区内无同名对应文件的配置类文件",
"allowSkills.title": "DSH skills 目录写入",
"allowSkills.desc": "允许写 <DSH_HOME>/skills",
"allowProfiles.title": "DSH profiles 目录写入",
"allowProfiles.desc": "允许在 .dsh/profiles 下安装/修改插件与 profile 配置",
"allowDshHome.title": "DSH 主目录写入",
"allowDshHome.desc": "允许写整个 <DSH_HOME>（兼容旧行为；可单独关闭）",
"allowSystemCommands.title": "系统睡眠/关机命令",
"allowSystemCommands.desc": "允许 shutdown / powercfg / systemctl suspend 等命令在宿主执行",
"allowSleepGuard.title": "睡眠守护",
"allowSleepGuard.desc": "任务执行期间保持系统不睡眠（Windows/Linux/macOS/WSL→Windows 主机）",
"writeDirs.title": "额外可写目录",
"writeDirs.desc": "添加任意绝对目录到写权限白名单；留空则只使用预设目录。",
"writeDirs.placeholder": "例如 E:\\projects 或 /home/user/projects",
"writeDirs.add": "添加目录",
"writeDirs.remove": "移除",
"writeDirs.save": "保存目录",
"writeDirs.saving": "保存中…",
"writeDirs.empty": "尚未添加额外目录",
"retry": "重试"
};
var en = {
"title": "Workspace Write Plus",
"description": "Extra write allowances and guard switches beyond workspace-write",
"loading": "Loading",
"unavailable": "Unavailable",
"error": "Failed to load. Click to retry",
"enabled.title": "Enable Workspace Write Plus",
"enabled.desc": "When off, all extra allowances and the sleep guard are disabled",
"allowConfigFiles.title": "Config files outside workspace",
"allowConfigFiles.desc": "Write config-type files outside the workspace with no same-named workspace counterpart",
"allowSkills.title": "DSH skills directory",
"allowSkills.desc": "Write files under <DSH_HOME>/skills",
"allowProfiles.title": "DSH profiles directory",
"allowProfiles.desc": "Install/edit plugins and profile composition under .dsh/profiles",
"allowDshHome.title": "DSH home directory",
"allowDshHome.desc": "Write anywhere under <DSH_HOME> (legacy; can be turned off independently)",
"allowSystemCommands.title": "System sleep/shutdown commands",
"allowSystemCommands.desc": "Allow shutdown / powercfg / systemctl suspend etc. to run on the host",
"allowSleepGuard.title": "Sleep guard",
"allowSleepGuard.desc": "Keep the system awake during agent turns (Windows/Linux/macOS/WSL to Windows host)",
"writeDirs.title": "Extra writable directories",
"writeDirs.desc": "Add any absolute directories to the write allowlist; empty means preset directories only.",
"writeDirs.placeholder": "e.g. E:\\projects or /home/user/projects",
"writeDirs.add": "Add directory",
"writeDirs.remove": "Remove",
"writeDirs.save": "Save directories",
"writeDirs.saving": "Saving…",
"writeDirs.empty": "No extra directories yet",
"retry": "Retry"
};

var FIELDS = [
{ key: "enabled", strong: true },
{ key: "allowConfigFiles" },
{ key: "allowSkills" },
{ key: "allowProfiles" },
{ key: "allowDshHome" },
{ key: "allowSystemCommands" },
{ key: "allowSleepGuard" },
];

function SettingsController(api) {
this.api = api;
this.view = null;
this.generation = 0;
}

SettingsController.prototype.load = async function () {
var generation = ++this.generation;
var response = await this.api.settings.describe({});
if (generation !== this.generation) return { cancelled: true };
if (!response.result.ok) throw new Error(response.result.error.message);
var value = response.result.value;
var view = null;
for (var i = 0; i < value.namespaces.length; i++) {
if (value.namespaces[i].ns === SETTINGS_NS) { view = value.namespaces[i]; break; }
}
if (view === null) {
this.view = null;
return { unavailable: true, writable: value.writable };
}
this.view = view;
return this.accept(view, value.writable);
};

SettingsController.prototype.setField = async function (field, fieldValue) {
if (!this.view) return this.load();
var generation = ++this.generation;
var response = await this.api.settings.mutate({
ns: SETTINGS_NS,
ops: [{ op: "set", path: [field], value: fieldValue }],
expectedRevision: this.view.revision,
});
if (generation !== this.generation) return { cancelled: true };
if (!response.result.ok) throw new Error(response.result.error.message);
this.view = response.result.value;
return this.accept(this.view, true);
};

SettingsController.prototype.accept = function (view, writable) {
var values = view.value && typeof view.value === "object" ? view.value : {};
return {
status: "ready",
values: values,
revision: view.revision,
writable: writable !== false,
};
};

// Newer DSH exposes the settings transport as the `settingsScope` service.
// Adapt its snapshot-based scope to the same load/setField shape the row uses.
function NewSettingsController(scope) {
this.scope = scope;
}

NewSettingsController.prototype.mapSnapshot = function (snapshot) {
if (snapshot.status === "unavailable") return { unavailable: true, writable: snapshot.writable };
if (snapshot.status === "loading") return { status: "loading", values: null, revision: 0, writable: false };
var values = snapshot.value && typeof snapshot.value === "object" ? snapshot.value : {};
return {
status: "ready",
values: values,
revision: snapshot.revision || 0,
writable: snapshot.writable !== false,
};
};

NewSettingsController.prototype.load = function () {
var self = this;
var scope = this.scope;
var read = function () {
var snapshot = scope.getSnapshot();
return snapshot.status === "loading" ? null : self.mapSnapshot(snapshot);
};
var immediate = read();
if (immediate !== null) return Promise.resolve(immediate);
return new Promise(function (resolve) {
var settled = false;
var off = scope.subscribe(function () {
var next = read();
if (next !== null && !settled) { settled = true; off(); resolve(next); }
});
setTimeout(function () {
if (settled) return;
settled = true; off();
resolve(read() || self.mapSnapshot(scope.getSnapshot()));
}, 10000);
});
};

NewSettingsController.prototype.setField = function (field, fieldValue) {
var self = this;
return this.scope.set(field, fieldValue).then(function () { return self.load(); });
};

function SwitchRow(props) {
var field = props.field;
var t = props.t;
var values = props.values || {};
var disabled = props.disabled || props.saving !== null;
var checked = Boolean(values[field.key]);
return React.createElement("label", {
style: {
display: "flex",
alignItems: "flex-start",
gap: "12px",
padding: "8px 0",
borderBottom: "1px solid rgba(127, 127, 127, 0.18)",
},
},
React.createElement("div", { style: { flex: "1 1 auto", minWidth: 0 } },
React.createElement("div", {
style: { fontWeight: field.strong ? 700 : 500, fontSize: "13px", lineHeight: "18px" },
}, t(field.key + ".title")),
React.createElement("div", {
style: { color: "var(--ds-text-secondary, #888)", fontSize: "12px", lineHeight: "16px", marginTop: "2px" },
}, t(field.key + ".desc"))),
React.createElement("input", {
type: "checkbox",
checked: checked,
disabled: disabled,
onChange: function (event) { props.onToggle(field.key, event.target.checked) },
style: { flex: "0 0 auto", marginTop: "2px" },
}));
}

function SettingsRow(props) {
var load = props.load;
var setField = props.setField;
var t = props.t || function (key) { return en[key] || key; };
var stateRef = React.useState({
status: "loading",
values: null,
revision: 0,
writable: false,
error: null,
saving: null,
});
var state = stateRef[0];
var setState = stateRef[1];
var dirsRef = React.useState([]);
var dirs = dirsRef[0];
var setDirs = dirsRef[1];

React.useEffect(function () {
if (state.values === null) { setDirs([]); return; }
setDirs(Array.isArray(state.values.allowWriteDirs) ? state.values.allowWriteDirs : []);
}, [state.values]);

React.useEffect(function () {
var alive = true;
setState(function (prev) { return { ...prev, status: "loading", error: null }; });
load().then(function (result) {
if (!alive || result.cancelled) return;
if (result.unavailable) {
setState(function (prev) { return { ...prev, status: "unavailable", writable: result.writable, values: null }; });
return;
}
setState(function (prev) {
return {
...prev,
status: result.status,
values: result.values,
revision: result.revision,
writable: result.writable,
error: null,
};
});
}).catch(function (error) {
if (!alive) return;
setState(function (prev) { return { ...prev, status: "error", error: error && error.message ? error.message : String(error) }; });
});
return function () { alive = false; };
}, [load]);

if (state.status === "unavailable") return null;

var applyField = function (field, fieldValue) {
if (state.saving !== null || !state.writable) return;
setState(function (prev) { return { ...prev, saving: field }; });
setField(field, fieldValue).then(function (result) {
if (result.cancelled) { setState(function (prev) { return { ...prev, saving: null }; }); return; }
setState(function (prev) {
return {
...prev,
status: result.status,
values: result.values,
revision: result.revision,
writable: result.writable,
saving: null,
error: null,
};
});
}).catch(function (error) {
setState(function (prev) {
return {
...prev,
saving: null,
status: "error",
error: error && error.message ? error.message : String(error),
};
});
});
};
var toggle = function (field, fieldValue) { applyField(field, fieldValue); };
var updateDir = function (index, value) {
var next = dirs.slice();
next[index] = value;
setDirs(next);
};
var addDir = function () { setDirs(dirs.concat([""])); };
var removeDir = function (index) {
var next = dirs.slice();
next.splice(index, 1);
setDirs(next);
};
var saveDirs = function () {
var cleaned = dirs.map(function (entry) { return (entry || "").trim(); }).filter(function (entry) { return entry.length > 0; });
applyField("allowWriteDirs", cleaned);
};

var body;
if (state.status === "error") {
body = React.createElement("button", {
type: "button",
onClick: function () { load(); },
style: { border: "none", background: "transparent", color: "var(--ds-accent, #4c8dff)", cursor: "pointer", padding: 0 },
}, t("error") + " — " + t("retry"));
} else if (state.values === null) {
body = React.createElement("div", { style: { fontSize: "12px", color: "#888" } }, t("loading"));
} else {
var rows = FIELDS.map(function (field) {
return React.createElement(SwitchRow, {
key: field.key,
field: field,
t: t,
values: state.values,
writable: state.writable,
saving: state.saving,
onToggle: toggle,
});
});
var dirEditor = React.createElement("div", {
style: { marginTop: "14px", paddingTop: "10px", borderTop: "1px solid rgba(127, 127, 127, 0.18)" },
},
React.createElement("div", { style: { fontWeight: 600, fontSize: "13px" } }, t("writeDirs.title")),
React.createElement("div", { style: { color: "var(--ds-text-secondary, #888)", fontSize: "12px", marginBottom: "8px" } }, t("writeDirs.desc")),
dirs.length === 0
? React.createElement("div", { style: { color: "var(--ds-text-secondary, #888)", fontSize: "12px", marginBottom: "6px" } }, t("writeDirs.empty"))
: null,
dirs.map(function (dir, index) {
return React.createElement("div", { key: index, style: { display: "flex", gap: "8px", marginBottom: "6px" } },
React.createElement("input", {
type: "text",
value: dir,
placeholder: t("writeDirs.placeholder"),
disabled: state.saving !== null,
onChange: function (event) { updateDir(index, event.target.value) },
style: { flex: "1 1 auto", minWidth: 0, padding: "6px 8px", border: "1px solid rgba(127, 127, 127, 0.3)", borderRadius: "6px", background: "transparent", color: "inherit", fontFamily: "inherit", fontSize: "12px" },
}),
React.createElement("button", {
type: "button",
onClick: function () { removeDir(index) },
disabled: state.saving !== null,
style: { border: "none", borderRadius: "6px", padding: "0 8px", background: "transparent", color: "var(--ds-text-secondary, #888)", cursor: "pointer" },
}, t("writeDirs.remove")));
}),
React.createElement("div", { style: { display: "flex", gap: "8px", marginTop: "6px" } },
React.createElement("button", {
type: "button",
onClick: addDir,
disabled: state.saving !== null,
style: { border: "1px solid rgba(127, 127, 127, 0.3)", borderRadius: "6px", padding: "4px 10px", background: "transparent", color: "inherit", cursor: "pointer" },
}, t("writeDirs.add")),
React.createElement("button", {
type: "button",
onClick: saveDirs,
disabled: state.saving !== null,
style: { border: "none", borderRadius: "6px", padding: "4px 10px", background: "var(--ds-accent, #4c8dff)", color: "#fff", cursor: "pointer" },
}, state.saving === "allowWriteDirs" ? t("writeDirs.saving") : t("writeDirs.save"))));
body = React.createElement("div", null, rows, dirEditor);
}

return React.createElement("div", { style: { padding: "4px 0 8px" } },
React.createElement("div", {
style: { fontSize: "13px", fontWeight: 700, marginBottom: "2px", display: "flex", alignItems: "center", gap: "8px" },
}, t("title")),
React.createElement("div", {
style: { color: "var(--ds-text-secondary, #888)", fontSize: "12px", marginBottom: "6px" },
}, t("description")),
body);
}


// --- Permission display name: Workspace Write Plus / 工作区内修改+ ---------
// The host names this preset with one static string (the profile patch's
// `name:`), and the core client localizes only the three stock presets, so the
// plugin owns its Chinese name here: the already-rendered label is rewritten
// in place and refreshed on every locale change. Plain text and attribute
// writes keep React's virtual DOM untouched, so a re-render carrying the same
// host string leaves the patch alone.

function labelInText(value) {
  var text = typeof value === 'string' ? value : '';
  return text.indexOf(MENU_LABEL) !== -1 || text.indexOf(MENU_LABEL_ZH) !== -1;
}

function textContainsLabel(el) {
  return labelInText(el.textContent);
}

function elementContainsLabel(el) {
  if (labelInText(el.textContent)) return true;
  for (var i = 0; i < LABEL_ATTRS.length; i++) {
    if (labelInText(el.getAttribute(LABEL_ATTRS[i]))) return true;
  }
  return false;
}

// Active display name: Chinese only while the active locale is a Chinese
// variant; every other locale keeps the English name the host supplies.
function currentMenuLabel(ctx) {
  var localeService = ctx.get('locale');
  var snapshot = localeService && typeof localeService.getSnapshot === 'function'
    ? localeService.getSnapshot()
    : null;
  var active = snapshot && snapshot.active ? String(snapshot.active) : '';
  return active.toLowerCase().indexOf('zh') === 0 ? MENU_LABEL_ZH : MENU_LABEL;
}

// Replace `from` with `to` inside every descendant text node. The General
// settings selector renders its label as a bare text node, while menus and the
// /permission popup wrap it in a span, so walk both shapes.
function replaceLabelInText(el, from, to) {
  var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  var node = walker.nextNode();
  while (node !== null) {
    var value = node.nodeValue;
    if (value && value.indexOf(from) !== -1) node.nodeValue = value.split(from).join(to);
    node = walker.nextNode();
  }
}

function replaceLabelInAttributes(el, from, to) {
  for (var i = 0; i < LABEL_ATTRS.length; i++) {
    var value = el.getAttribute(LABEL_ATTRS[i]);
    if (value && value.indexOf(from) !== -1) el.setAttribute(LABEL_ATTRS[i], value.split(from).join(to));
  }
}

function patchPermissionLabels(ctx) {
  var label = currentMenuLabel(ctx);
  var other = label === MENU_LABEL_ZH ? MENU_LABEL : MENU_LABEL_ZH;
  var candidates = document.querySelectorAll(LABEL_CANDIDATES);
  for (var i = 0; i < candidates.length; i++) {
    var el = candidates[i];
    if (!elementContainsLabel(el)) continue;
    replaceLabelInText(el, other, label);
    replaceLabelInAttributes(el, other, label);
  }
}

function insertGlyph(el, className, size, attr) {
  // Recover when React re-renders the row and drops the manually inserted
  // span: the marker may survive while the glyph node is gone.
  if (el.getAttribute(attr) === '1' && el.querySelector(':scope > .' + className)) return;
  el.removeAttribute(attr);
  el.setAttribute(attr, '1');
  var glyph = document.createElement('span');
  glyph.className = className;
  glyph.setAttribute('aria-hidden', 'true');
  glyph.appendChild(workspaceWritePlusSvg(size));
  el.insertBefore(glyph, el.firstChild);
}

var name = 'dsh-permission-workspace-write-plus';

function apply(ctx) {
  ctx.effect(function () {
    var style = document.createElement('style');
    style.setAttribute('data-dsh-workspace-write-plus', '');
    style.textContent = CSS;
    document.head.appendChild(style);
    return function () { style.remove() };
  }, 'dsh-workspace-write-plus: access glyph css');

  // Surface patcher:
  // 1. Every rendered permission label is rewritten to the active locale's
  //    name (Chinese "工作区内修改+" or English "Workspace Write Plus").
  // 2. Conversation permission dropdown rows get the Workspace Write Plus
  //    glyph; menu rows inside the settings dialog are intentionally left
  //    with no glyph (matching the three built-in permission rows there).
  // 3. The conversation permission trigger gets the same glyph.
  // 4. The settings nav cell gets the permission glyph instead of the
  //    default settings gear.
  var observer = null;
  function patchMenuItems() {
    var rows = document.querySelectorAll('[role="menuitem"]');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.getAttribute(GLYPH_ATTR) === '1') continue;
      if (!textContainsLabel(row)) continue;
      // Settings permission list: keep it icon-less like the built-ins.
      // That menu is portal-rendered to document.body, so the dialog check
      // alone is not enough; skip portaled menus as well.
      if (row.closest && row.closest('[role="dialog"]')) continue;
      var menu = row.closest ? row.closest('[role="menu"]') : null;
      if (menu && menu.parentElement === document.body) continue;
      if (menu && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
        var menuStyle = window.getComputedStyle(menu);
        if (menuStyle && menuStyle.position === 'fixed') continue;
      }
      insertGlyph(row, 'dsh-wwp-menu-glyph', 16, GLYPH_ATTR);
    }
  }

  // The composer trigger is the only permission button carrying the name in
  // its aria-label; the General-settings selector deliberately stays
  // icon-less, so this must not widen to plain label text.
  function patchTriggers() {
    var triggers = document.querySelectorAll('button[aria-label]');
    for (var i = 0; i < triggers.length; i++) {
      if (!labelInText(triggers[i].getAttribute('aria-label'))) continue;
      insertGlyph(triggers[i], 'dsh-wwp-trigger-glyph', 14, TRIGGER_ATTR);
    }
  }

  function patchSettingsNav() {
    var dialogs = document.querySelectorAll('[role="dialog"]');
    for (var d = 0; d < dialogs.length; d++) {
      var buttons = dialogs[d].querySelectorAll('nav button');
      for (var i = 0; i < buttons.length; i++) {
        var button = buttons[i];
        if (!textContainsLabel(button)) continue;
        if (button.getAttribute(NAV_ATTR) === '1') continue;
        var first = button.firstElementChild;
        if (first && first.tagName && first.tagName.toLowerCase() === 'svg') {
          first.style.display = 'none';
          first.setAttribute(NAV_HIDDEN_ATTR, '1');
        }
        insertGlyph(button, 'dsh-wwp-nav-glyph', 16, NAV_ATTR);
      }
    }
  }

  function patchPermissionSurfaces() {
    patchPermissionLabels(ctx);
    patchMenuItems();
    patchTriggers();
    patchSettingsNav();
  }

  function cleanupGlyphs() {
    document.querySelectorAll('.dsh-wwp-trigger-glyph, .dsh-wwp-menu-glyph, .dsh-wwp-nav-glyph').forEach(function (el) { el.remove() });
    document.querySelectorAll('[' + GLYPH_ATTR + '="1"], [' + TRIGGER_ATTR + '="1"], [' + NAV_ATTR + '="1"]').forEach(function (el) {
      el.removeAttribute(GLYPH_ATTR);
      el.removeAttribute(TRIGGER_ATTR);
      el.removeAttribute(NAV_ATTR);
    });
    document.querySelectorAll('[' + NAV_HIDDEN_ATTR + '="1"]').forEach(function (el) {
      el.style.display = '';
      el.removeAttribute(NAV_HIDDEN_ATTR);
    });
  }

  // Unloading the plugin must give the host string back, so a disabled plugin
  // does not leave a Chinese label behind on the core-rendered surfaces.
  function cleanupLabels() {
    var candidates = document.querySelectorAll(LABEL_CANDIDATES);
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (!elementContainsLabel(el)) continue;
      replaceLabelInText(el, MENU_LABEL_ZH, MENU_LABEL);
      replaceLabelInAttributes(el, MENU_LABEL_ZH, MENU_LABEL);
    }
  }

  var scheduled = false;
  var disposed = false;
  // A streaming turn mutates the transcript continuously and every patch
  // rescans the document, so coalesce observer bursts into one patch a frame.
  function schedulePatch() {
    if (scheduled || disposed) return;
    scheduled = true;
    var run = function () {
      scheduled = false;
      if (!disposed) patchPermissionSurfaces();
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }

  ctx.effect(function () {
    patchPermissionSurfaces();
    observer = new MutationObserver(schedulePatch);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      // React rewrites a label text node and the trigger's aria-label in place
      // when the active locale changes; without these the patch would only
      // heal on the next structural change.
      characterData: true,
      attributes: true,
      attributeFilter: LABEL_ATTRS,
    });
    return function () {
      disposed = true;
      if (observer) { observer.disconnect(); observer = null }
      cleanupGlyphs();
      cleanupLabels();
    };
  }, 'dsh-workspace-write-plus: permission labels, glyphs and settings nav glyph');

  // Dedicated settings section (same level as General) for the
  // workspace-write-plus switches.
  var locale = ctx.get('locale');
  var t = locale ? locale.bind(NS) : function (key) { return en[key] || key; };
  if (locale) {
    ctx.effect(function () {
      return locale.register(NS, { zh: zh, en: en });
    }, 'dsh-workspace-write-plus: settings dictionaries');
    if (typeof locale.subscribe === 'function') {
      ctx.effect(function () {
        return locale.subscribe(schedulePatch);
      }, 'dsh-workspace-write-plus: permission label locale refresh');
    }
  }
  var connection = ctx.get('connection');
  var registered = false;
  function registerSettingsSection(controller) {
    if (registered || !ctx.slots) return;
    registered = true;
    var load = function () { return controller.load(); };
    var setField = function (field, value) { return controller.setField(field, value); };
    ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: 'workspace-write-plus',
      order: 10,
      label: () => t('title'),
      locale: NS,
      inject: () => ({ load: load, setField: setField }),
    }, SettingsRow));
  }
  // Newer DSH: the settings transport is the optional `settingsScope`
  // service. `ctx.inject` degrades quietly on harnesses that do not provide
  // it, so the legacy branch below remains the fallback.
  ctx.inject(['settingsScope'], function (settingsCtx) {
    var binder = settingsCtx.settingsScope;
    if (binder === undefined || typeof binder.bind !== 'function') return;
    registerSettingsSection(new NewSettingsController(binder.bind({ namespace: SETTINGS_NS })));
  });
  // Older DSH: settings live on the connection API client.
  if (connection && connection.api && connection.api.settings
      && typeof connection.api.settings.describe === 'function') {
    registerSettingsSection(new SettingsController(connection.api));
  }
}

module.exports = { name: name, apply: apply, inject: ['slots', 'locale', 'connection'] };
return module.exports;
}
});
