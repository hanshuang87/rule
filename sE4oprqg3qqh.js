// ---------- Proxy Groups ----------

const CUSTOM_FALLBACK_NAMES = ["香港故障回退", "日本故障回退", "美国故障回退"];
const REMOVED_GROUP_NAMES = new Set(["自动选择", "故障转移"]);

function buildCustomFallbackGroups(allProxies) {
  const hkRe = /香港(?!.*直连)(?!.*10G)/i;
  const hkProxies = allProxies.filter(name => hkRe.test(name));
  const jpRe = /日本(?!.*直连)/i;
  const jpProxies = allProxies.filter(name => jpRe.test(name));
  const usRe = /美国直连(?!.*直连)/i;
  const usProxies = allProxies.filter(name => usRe.test(name));

  const pools = [hkProxies, jpProxies, usProxies];
  const customGroups = CUSTOM_FALLBACK_NAMES.map((name, i) => ({
    name,
    type: "fallback",
    proxies: pools[i].length > 0 ? pools[i] : ["DIRECT"],
    url: "http://www.gstatic.com/generate_204",
    interval: 300
  }));

  const matchBy = target => allProxies.filter(name => target.test(name));

  const geminiGroup = {
    name: "Gemini",
    type: "fallback",
    url: "https://www.gstatic.com/generate_204",
    interval: 300,
    lazy: true,
    proxies: matchBy(/美国直连/).concat(
      matchBy(/香港.*-AI/)
    )
  };

  return { customGroupNames: CUSTOM_FALLBACK_NAMES, customGroups: [...customGroups, geminiGroup] };
}

function reorganizeProxyGroups(config) {
  const allProxies = (config.proxies || []).map(p => p.name);
  const { customGroupNames, customGroups } = buildCustomFallbackGroups(allProxies);

  let pg = [...customGroups, ...(config["proxy-groups"] || [])];
  pg = pg.filter(g => !REMOVED_GROUP_NAMES.has(g.name));

  const idx = pg.findIndex(g => g.name === "极光加速");
  if (idx === -1) {
    config["proxy-groups"] = pg;
    return;
  }

  const mainGroup = pg[idx];
  const fallbackNameSet = new Set(customGroupNames);
  let proxies = [...(mainGroup.proxies || [])];
  proxies = proxies.filter(
    p => !REMOVED_GROUP_NAMES.has(p) && !fallbackNameSet.has(p) && p !== "Gemini"
  );

  pg[idx] = {
    ...mainGroup,
    name: "手动选择",
    proxies
  };

  const relayProxies = ["手动选择", ...customGroupNames];
  const newSelect = name => ({
    name,
    type: "select",
    proxies: [...relayProxies]
  });

  pg.splice(idx + 1, 0, newSelect("极光加速"));

  for (const g of pg) {
    if (Array.isArray(g.proxies)) {
      g.proxies = g.proxies.filter(p => !REMOVED_GROUP_NAMES.has(p));
    }
  }

  config["proxy-groups"] = pg;
}

// ---------- Rules (static GEOSITE rules) ----------

function getHeadRules() {
  return [
    "PROCESS-NAME,qbittorrent.exe,DIRECT",
    "GEOSITE,google-gemini,Gemini",
    "GEOSITE,openai,美国故障回退",
    "DOMAIN-SUFFIX,chatgpt.livekit.cloud,美国故障回退",
  ];
}

function prependHeadRules(config) {
  const headRules = getHeadRules();
  const headKeys = new Set(
    headRules
      .filter(r => r.startsWith("GEOSITE,") || r.startsWith("RULE-SET,"))
      .map(r => r.split(",")[1])
  );

  const rules = (config.rules || []).filter(r => {
    if (r.startsWith("GEOSITE,") || r.startsWith("RULE-SET,")) {
      return !headKeys.has(r.split(",")[1]);
    }
    return true;
  });

  config.rules = [...headRules, ...rules];
}

// ---------- Main ----------

function main(config) {
  reorganizeProxyGroups(config);
  prependHeadRules(config);
  return config;
}
