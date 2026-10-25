import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { verifyAuth } from "../auth";

export interface MachineItem {
  name: string;
  number: number;
  total: number;
}

const VALID_MACHINES = ["4820", "5122", "5317"] as const;

const BASE_URL = "https://data.point24h.com";
const CREDENTIALS = { username: "bellegem", password: "MSb7@gACv" };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, { items: MachineItem[]; expires: number }>();
const isDev = process.env.NODE_ENV === "development";
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args); };

async function scrapeWithFetch(machine: string): Promise<MachineItem[]> {
  const cheerio = await import("cheerio");
  const cookies: Record<string, string> = {};

  const getCookieHeader = () =>
    Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

  const saveCookies = (res: Response) => {
    // Use getSetCookie() (Node 18.14+) to get each Set-Cookie header separately.
    // Falling back to get('set-cookie') is unreliable as it merges multiple headers.
    const headers = res.headers as any;
    const list: string[] =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : (res.headers.get("set-cookie") ?? "").split(/,(?=[^ ])/).filter(Boolean);
    for (const cookie of list) {
      const [nameValue] = cookie.split(";");
      const eq = nameValue.indexOf("=");
      if (eq > 0) {
        cookies[nameValue.slice(0, eq).trim()] = nameValue.slice(eq + 1).trim();
      }
    }
  };

  // Helper: fetch with redirect:manual so we capture Set-Cookie on 302 responses,
  // then follow the redirect chain ourselves.
  const BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.8",
  };

  const fetchManual = async (url: string, init: RequestInit = {}): Promise<Response> => {
    let currentUrl = url;
    let currentInit = init;
    for (let i = 0; i < 10; i++) {
      const res = await fetch(currentUrl, {
        ...currentInit,
        headers: { ...BROWSER_HEADERS, Cookie: getCookieHeader(), ...(currentInit.headers as object ?? {}) },
        redirect: "manual",
      });
      saveCookies(res);
      devLog(`[automaten] ${currentInit.method ?? "GET"} ${currentUrl} → ${res.status}`);
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return res;
        currentUrl = new URL(location, currentUrl).toString();
        currentInit = {};
      } else {
        return res;
      }
    }
    throw new Error("Too many redirects");
  };

  // Step 1: Hit logout URL to get a fresh session and the login form
  const logoutRes = await fetchManual(`${BASE_URL}/index.php?azione=Logout`);
  const loginHtml = await logoutRes.text();
  devLog("[automaten] cookies after logout:", getCookieHeader());
  devLog("[automaten] login form HTML:", cheerio.load(loginHtml)("form").html()?.slice(0, 800));

  // Step 2: Extract form action and submit button value from the login page
  const $login = cheerio.load(loginHtml);
  const formAction = $login("form").attr("action") ?? "/index.php";
  const submitValue = ($login('input[name="posted_azione"]').val() as string | undefined) ?? "Login";
  devLog("[automaten] formAction:", formAction, "| submitValue:", submitValue);
  devLog("[automaten] login page title:", $login("title").text());

  // Step 3: POST login credentials (redirect:manual via fetchManual captures the session cookie)
  // The site's login form injects `js=presente` via JavaScript as a basic bot-check.
  await fetchManual(new URL(formAction, BASE_URL).toString(), {
    method: "POST",
    headers: {
      Cookie: getCookieHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": `${BASE_URL}/index.php?azione=Logout`,
      "Origin": BASE_URL,
    },
    body: new URLSearchParams({
      posted_username: CREDENTIALS.username,
      posted_password: CREDENTIALS.password,
      posted_azione: submitValue,
      js: "presente",
    }).toString(),
  });
  devLog("[automaten] cookies after login:", getCookieHeader());

  // Step 4: Fetch machine inventory page
  const machineRes = await fetchManual(`${BASE_URL}/dev/index.php?azione=Kaart%20kast&matricola_macchina=${machine}`);
  const html = await machineRes.text();
  const $html = cheerio.load(html);
  devLog("[automaten] machine page title:", $html("title").text());
  devLog("[automaten] #dati found:", $html("#dati").length > 0);
  // Step 5: Parse table with cheerio (same logic as before)
  const $ = cheerio.load(html);
  const tableList: string[][] = [];

  $("#dati tr").each((_index, row) => {
    const rowList: string[] = [];
    $(row)
      .find("td")
      .each((_, cell) => rowList.push($(cell).text().trim()));
    tableList.push(rowList);
  });

  const items: MachineItem[] = [];
  let fries = 0;

  for (const element of tableList) {
    if (element.length === 0 || element[4]?.includes("↑") || !element[4]) continue;
    let name = element[4];
    if (name.includes("Verse frietjes")) {
      fries++;
      if (fries > 3) name = "Verse frietjes Klein (voorgebakken)";
    }
    const number = Number(element[5]);
    const total = Number(element[6]);
    if (!isNaN(number) && !isNaN(total)) {
      items.push({ name, number, total });
    }
  }

  return items;
}

const automaten = new Hono();

automaten.use("*", verifyAuth);

// ─── GET /api/automaten?machine=XXXX ─────────────────────────────────────────
automaten.get("/", async (c) => {
  const machine = c.req.query("machine");

  if (!machine || !(VALID_MACHINES as readonly string[]).includes(machine)) {
    throw new HTTPException(400, {
      message: `Invalid machine code. Must be one of: ${VALID_MACHINES.join(", ")}`,
    });
  }

  const cached = cache.get(machine);
  if (cached && cached.expires > Date.now()) {
    return c.json({ ok: true, machine, items: cached.items });
  }

  try {
    const items = await scrapeWithFetch(machine);
    if (items.length > 0) {
      cache.set(machine, { items, expires: Date.now() + CACHE_TTL_MS });
    }
    return c.json({ ok: true, machine, items });
  } catch (err) {
    console.error("[automaten] Error scraping machine", machine, err);
    throw new HTTPException(500, { message: "Failed to fetch machine data" });
  }
});

export { automaten as automatenRouter };
