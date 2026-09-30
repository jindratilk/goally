# Goally – produktové zadání

Téma hackathonu: Ideas for developer / platform tooling

## Problém

- Při velkých úkolech musím dělat projektového manažera agenta: ručně zjišťuji, co je hotové, co zbývá a co se právě děje.
- Agent napíše „hotovo“ bez důkazu a další nedodělky se ukážou až později. Odpovědnost pak nesu já.
- Paralelní agenti a subagenti pracují každý zvlášť a nikdo nehlídá, jestli se jejich výsledky spojí do finálního výstupu.
- Agenti se zasekávají na detailech, zbytečně přehnaně řeší (over-engineering) a místo cíleného testování dělají plné buildy.
- Nevidím, na čem agenti pracují teď a co bude následovat, takže neefektivitu odhalím pozdě.
- Po pádu nebo změně chatu musím ručně rekonstruovat, kde práce skončila.

## Vize

Goally je celá harness kolem hlavního agenta, ne jen dashboard. Skládá se ze skillu, hooků a MCP a je postavená pro Cursor hackathon. Pain pointy, ze kterých vychází, jsou vidět v mých Codex sessions. Při dalším rozpracování se proto vždy vrací do nich.

Používání je jednoduché. Označím skill a zadám velký, komplexní úkol. Agent nejdřív udělá audit: projde všechny úkoly, které je potřeba udělat, a rozdělí je. Potom spustí dashboard a ten je od té chvíle jeho společný pohled s uživatelem. Agent komunikuje s dashboardem a jak (hooks, MCP, nebo obojí), je technický detail, který vyřešíme později.

Dashboard je board s úkoly. Je na něm jasně vidět, kteří agenti právě pracují paralelně, na čem, co je hotové, co je blokované a co bude následovat. Design je vždy stejný a je předkódovaný přímo ve skillu. Vychází z lokálního projektu Plan in Blue. Místo modré je černobílý, tedy tmavě černý pozadí s bílými liniemi. Rozvržení boardu vychází z jednoduchého HTML trackeru z CutAgentu (sloupce úkolů, karty s vlastníkem a postupem, souhrnné metriky a filtr). Ten je ale mnohem menší, než jaký chci mít tady.

Ve chvíli, kdy se dashboard spustí, se na pozadí spustí Grok Build harness  vezmutá z jeijcih GitHubu. Ten hlídá celý systém jako nezávislý dozor. Kontroluje, jestli agenti odpovídají zadání, jestli něco zbytečně overengeenerují, jestli se nezasekli na detailech a jestli místo konkrétního testu nedělají plné buildy. Když něco takového zjistí, rovnou zásahne. Mělo by se to spouštět každých 10 minut tato kontrola.

Chtěl bych aby ta dashboard byla online a já ji viděl i na telefonu - zde nevím zda použíti vercel nebo cloudflare tunnel.

Výsledný pocit: zadám velký úkol, vidím jasný board s paralelní prací a nemusím agentovi věřit na slovo, protože dozor hlídá, jestli práce opravdu odpovídá zadání.

## Dashboard: design, nastavení a statistiky

### Design: SpaceX mission control × blueprint

- **Motiv:** řídicí středisko mise. Běh úkolu je „mise“, karty jsou „stages“, dozor Grok je „Goal Director“ a verdikt „hotovo“ je **GO / NO-GO poll**. V něm každý požadavek hlásí GO jen s důkazem.
- **Barvy (SpaceX):** absolutní černá `#000`, text `#f0f0fa`, linky a rámečky `rgba(240,240,250,0.35)`, jemné plochy `rgba(240,240,250,0.1)`. Jinak žádné barevné akcenty.
- **Stavové barvy, jen střídmě:** červená `#cc0000` pro chybu a NO-GO, jantarová `#f5a623` pro blokováno a hold. Hotovo je plně bílé.
- **Fonty (SpaceX):** D-DIN a D-DIN-Bold (licence SIL OFL, hostované lokálně), záložní font Barlow. Popisky a navigace jsou VELKÝMI písmeny s prostrkáním 0.1em, čísla mají tabulkové číslice.
- **Tlačítka (SpaceX):** tenký obrys 1 px, radius 4 px, bez výplně. Po najetí se vyplní bílou s černým textem.
- **Blueprint prvky (z Plan in Blue):** mřížka 24/120 px, kreslicí rámeček s kótovacími šipkami, kótovací čáry `|<— label —>|` jako progress bar a ručně psané anotace (Architects Daughter). Anotace jsou jen poznámky a kóty, nikdy ne data.
- **Pohyb:** jemné a účelné animace přes Motion. Karta „dojede“ do dalšího sloupce, čas mise běží jako `T+00:42:13`. Respektuje se `prefers-reduced-motion`.
- **Mobil:** stejný design, board se na telefonu složí do jednoho sloupce se záložkami podle stavu.

### Jak se design vybere a zafixuje

- Nejdřív připravím **3 vizuální směry** hlavní obrazovky boardu ve stejném systému barev a fontů, které se budou lišit rozvržením a mírou blueprint prvků. Ty jeden vybereš.
- Vybraný směr se zafixuje v `DESIGN.md` a v `tokens.css` uvnitř pluginu. Agent UI nikdy negeneruje, dashboard je předpřipravená aplikace.

### Komponenty a knihovny

- **shadcn/ui** (Radix) jako základ komponent, přestylovaný na SpaceX tokeny. Stejný přístup, který funguje v ebookovně.
- **Motion** (dříve Framer Motion) pro mikrointerakce, **Recharts** přes shadcn Charts pro grafy, **lucide** pro ikony a **Sonner** pro notifikace o zásazích.
- **Vite + React + Tailwind v4.** Dashboard se sestaví na statické soubory a servíruje ho daemon, takže nepotřebuje žádný server navíc.

### Nastavení (v dashboardu, uložené v `~/.goally/config.json`)

- **Maximální počet paralelních agentů.** Hook `subagentStart` odmítne dalšího subagenta nad limit se zprávou „počkej, běží N agentů“.
- **Goal Director:** zapnuto nebo vypnuto, interval (výchozí 10 min) a model/úsilí Grok.
- **Intervention:** vypínač — zapnuto = Goal Director píše do hlavního chatu; vypnuto = nálezy jen na boardu.
- **Vzdálený přístup** přes tunel zapnuto nebo vypnuto.
- **Pauza mise:** nové subagenty nepustí.
- Měnit nastavení jde jen lokálně. Na telefonu se nastavení jen zobrazí.

### Statistiky

- **Nahoře:** čas mise, hotové karty / všechny, pokrytí důkazy (%) a počet právě běžících agentů.
- **Graf paralelní práce v čase:** kolik agentů běželo a kdy, včetně nastaveného limitu.
- **Na agenta:** délka běhu, počet tool callů a zpráv, změněné soubory a výsledek (údaje dodá `subagentStop`).
- **Kvalita:** zelené a červené testy, cílené testy vs. plné buildy, selhání a přerušení a počet kompakcí kontextu.
- **Dozor:** nálezy podle typu, zásahy a to, zda agent zásah splnil.
- **Historie misí:** průměrný čas na kartu a nejčastější typy problémů napříč běhy.

## Na co nezapomenout

- **Hlavní agent má vlastní kartu** („Main“), aby byla vidět i jeho práce, nejen subagenti.
- **Kolize souborů:** když dva agenti upraví stejný soubor, board ukáže varování.
- **Replay mód:** přehrání uloženého běhu z `events.jsonl` pro spolehlivé demo bez živého agenta.
- **Výpadek dozoru:** když Grok nemá limit nebo neodpovídá, board to ukáže a mise běží dál bez něj.
- **Víc misí a projektů:** výběr mise a historie. Daemon je jeden pro všechny workspace.

## Technické řešení

### Balení: Cursor Plugin

- Celé to bude jeden **Cursor Plugin** (`.cursor-plugin/plugin.json`), protože jen tento formát umí zabalit dohromady skill, hooky, MCP server i příkazy.
- Otevřený standard Agent Plugins hooky nepodporuje, proto ho nepoužijeme.
- Na hackathon se plugin nainstaluje lokálně do `~/.cursor/plugins/local/goally`. Potom se udělá „Reload Window“.
- Později ho lze poslat do Cursor Marketplace. Plugin musí být open source a Cursor ho ručně zkontroluje.

```
goally/
├── .cursor-plugin/plugin.json
├── skills/goally/SKILL.md     # audit → plán → spuštění boardu
├── commands/goally-setup.md           # onboarding
├── hooks/hooks.json                  # události z Cursoru
├── mcp.json                          # MCP server (stdio)
└── bin/goally                         # jeden Node program: daemon, hook, mcp
```

### Architektura

```
Cursor agent + subagenti
   │ hooks (JSON)        │ MCP (nástroje)
   ▼                     ▼
goally daemon (127.0.0.1:4777) ── events.jsonl
   ├─ board API + dashboard (polling 2 s)
   ├─ supervisor: každých 10 min spustí grok -p
   └─ fronta zásahů → doručí je další hook
   ▼
Cloudflare Tunnel + Access → dashboard na telefonu
```

- **Jeden program, tři role:** `goally daemon`, `goally hook <event>`, `goally mcp`. Je to jeden Node balíček, bez databázového serveru.
- **Úložiště:** append-only `events.jsonl` na jeden běh. Stav se po startu dopočítá v paměti, takže je potřeba nejméně závislostí.
- **Daemon** se spustí sám při prvním volání MCP nebo hooku. Zámek v souboru zajistí, že běží jen jeden, i když je otevřeno víc oken Cursoru.

### Skill (co agent dělá)

- Na `/goally` s velkým úkolem agent nejdřív udělá audit. Zadání rozdělí na karty s ID, vlastníkem, závislostmi, akceptačním kritériem a cíleným testem.
- Plán pošle přes MCP, dostane odkaz na dashboard a pošle ho uživateli.
- Každý subagent dostane v zadání štítek karty, např. `[CT-3]`. Hooky tak spárují subagenta s kartou, protože `subagentStop` nevrací ID subagenta, ale vrací text zadání.
- Kartu smí agent označit jako hotovou jen s důkazem (test, commit, URL). Plný build jen tehdy, když ho karta výslovně vyžaduje.

### MCP server (agent → board)

Agent jím zapisuje to, co hooky nevidí: plán, záměr a důkazy.

- `goally_start_run`: uloží plán z auditu a vrátí URL dashboardu.
- `goally_update_task`: změní stav karty nebo přidá poznámku.
- `goally_complete_task`: označí kartu jako hotovou s důkazem. Daemon ověří, že po poslední úpravě souborů proběhl zelený test.
- `goally_status`: vrátí, co zbývá a co blokuje, včetně nálezů dozoru.
- `goally_resume`: vrátí pokračovací brief po pádu nebo v novém chatu.
- `goally_ack`: manažer potvrdí zprávu od dozoru nebo od tebe (přijato / odmítnuto s důvodem / vyřešeno).
- Bonus: `goally_status` vrátí board i jako **MCP App**, takže se živý board zobrazí přímo v chatu Cursoru.

### Hooky (Cursor → board, a zpět zásahy)

Hooky jsou zdroj pravdy o tom, co se opravdu stalo. Agent je nemůže vynechat.

- `sessionStart`: pokud je ve workspace rozpracovaný běh, vloží jeho stav do kontextu (`additional_context`).
- `subagentStart` / `subagentStop`: karta se přepne na „pracuje“ a potom na „hotovo, chyba nebo přerušeno“. Uloží se změněné soubory, souhrn a délka běhu.
- `afterFileEdit`: ukáže, kdo mění které soubory, a zneplatní staré testové důkazy.
- `postToolUse` / `postToolUseFailure`: rozpozná testy, buildy a git. Vrací cestu k **doručení zásahu** (`additional_context`).
- `stop`: zaznamená konec tahu manažera a může spustit Goal Director kontrolu. Bez auto-continue smyčky.
- `preCompact`: před kompakcí uloží checkpoint pro obnovu.
- Každý hook se zeptá daemonu, skončí do 1 s, a když daemon neběží, pustí agenta dál.

### Grok Build jako dozor

- Použije se oficiální `grok` CLI, tedy open-source harness z `github.com/xai-org/grok-build`. Nainstaluje se skriptem z x.ai, nebo se sestaví ze zdroje.
- **Vlastní předplatné:** uživatel se jednou přihlásí příkazem `grok login` (SuperGrok nebo X Premium+). Headless běhy pak použijí uložené přihlášení. Alternativou je `XAI_API_KEY`. Goally přihlašovací údaje nikdy nečte, jen spouští `grok`.
- Každých 10 minut, a navíc po každém `subagentStop` a `stop`, daemon připraví snapshot. Obsahuje zadání, board, poslední příkazy, `git diff --stat` a cesty k transcriptům.
- Snapshot se spustí příkazem `grok -p --prompt-file snapshot.md --output-format json --tools read_file,grep,list_dir --resume <session>`. Dozor tak smí jen číst a díky `--resume` si pamatuje předchozí kontroly.
- Grok vrátí JSON s nálezy typu `overengineering`, `stuck`, `full-build`, `off-scope` nebo `no-proof`, se závažností a doporučeným krokem.
- **Zásah:** nález se zobrazí na boardu a zapíše se do schránky hlavního agenta, viz další sekce. Grok sám nic neupravuje a nikomu nepíše napřímo.
- Pravidla dozoru, tedy co je over-engineering nebo zaseknutí, vycházejí z pain pointů v Codex sessions.
- Když se od minulé kontroly nic nezměnilo, kontrola se přeskočí, aby se zbytečně nečerpal limit předplatného.

### Jak dozor píše do hlavní Cursor session (manažera)

- **Píše jen manažerovi.** Hlavní session je ta, která zavolala `goally_start_run`, a daemon si uloží její `conversation_id`. Subagentům dozor nepíše. Instrukci jim předá manažer tak, že subagenta pokračuje s novým zadáním, zastaví ho nebo spustí nového.
- **Schránka (inbox):** každá zpráva dozoru, a také tvoje zpráva z dashboardu nebo z telefonu, se uloží do schránky manažera s ID, závažností a doporučeným krokem. Na boardu je vidět její stav: čeká, doručeno, potvrzeno, vyřešeno.
- **Formát zprávy:** `[GOAL DIRECTOR · F-12 · HIGH · CT-3] Plný build už potřetí. Spusť jen test pro src/export. Potvrď přes goally_ack.`
- **Hlavní cesta: Cursor Desktop Bridge.** Je to skrytá funkce přímo v Cursoru a v tvé verzi 3.22.12 je zabudovaná. Příkaz `cursor desktop send <thread-id> "zpráva"` vloží zprávu do existující session kdykoli, stejně jako kdybys ji napsal ty. `cursor desktop ls --json` vypíše session s ID, názvem, stavem a oknem.
  - **Výchozí chování:** když manažer zrovna pracuje, zpráva se zařadí do fronty a odešle se hned po jeho aktuálním tahu. Když manažer stojí, spustí se nový tah okamžitě.
  - **Kritický nález:** `--force` přeruší aktuální tah a zprávu odešle hned. Používá se jen při závažnosti HIGH, například při zbytečném plném buildu nebo při práci mimo zadání.
  - **Zabezpečení je vestavěné:** bridge běží lokálně s náhodným bearer tokenem uloženým v `~/.cursor/desktop-bridge/` a přístupným jen vlastníkovi.
  - **Zapnutí:** Settings → Beta → „Allow CLI to access desktop agents“ a restart Cursoru. Vypínač je navíc za feature gate `desktop_bridge`, který je ve výchozím stavu vypnutý. Když se v Beta nezobrazí, jde ho zpřístupnit spuštěním Cursoru s testovacím feature flagem (neoficiální). Na hackathonu Cursoru se vyplatí poprosit tým Cursoru o zapnutí gate.
  - **Párování:** daemon zjistí thread ID manažera z `cursor desktop ls --json`. Spike ověří, zda se shoduje s `conversation_id` z hooků. Záložně skill session pojmenuje `MISSION · <název>` a párování proběhne podle názvu.
- **Záloha 1: GUI automatizace** pro případ, že Desktop Bridge nepůjde zapnout. Cursor se spustí s `--remote-debugging-port` a daemon přes CDP vybere správný chat, vloží text a odešle ho. Na tomto principu fungují komunitní projekty `cursor-bridge-mcp` a `nitech/auto`. Alternativou je Peekaboo nebo macOS Accessibility (fokus okna, vložení, Enter). Obojí je křehčí, závisí na UI Cursoru a u Accessibility bere fokus okna.
- **Záloha 2: hooky** (fungují vždy, ale jen při činnosti manažera):
  1. **Manažer pracuje:** další hook v jeho session (`postToolUse`) přidá zprávu přes `additional_context`.
- **Potvrzení:** manažer musí zprávu potvrdit přes MCP `goally_ack` (přijato / odmítnuto s důvodem / vyřešeno). Nepotvrzená zpráva se po 5 minutách pošle znovu a dozor ji uvidí v příští kontrole.
- **Proti zahlcení:** stejný nález se znovu nepošle, dokud se situace nezmění. Nejvýše jedna zpráva s `--force` za 10 minut.
- **Stejnou cestou píšeš manažerovi i ty** z dashboardu nebo z telefonu: napíšeš zprávu, daemon ji pošle přes `cursor desktop send`.
- **Spike ověří:** zapnutí Desktop Bridge u tebe, shodu thread ID s `conversation_id` a to, zda hooky nástrojů subagenta nesou ID manažera, nebo subagenta.

### Online dashboard na telefonu: Cloudflare Tunnel, ne Vercel

- **Vercel** by znamenal přesunout stav do cloudové databáze a synchronizovat ho z lokálního počítače. To jsou dva systémy navíc. Nepoužijeme ho.
- **Rozhodnuto: Cloudflare Quick Tunnel zdarma.** `goally tunnel start` (nebo Settings → Remote access) spustí `cloudflared tunnel --url http://127.0.0.1:4777` a adresa `*.trycloudflare.com` se vytvoří sama, bez účtu a domény.
- Quick Tunnel nemá přihlášení, proto odkaz nese soukromý klíč. Po prvním otevření ho prohlížeč uloží jako cookie a z adresy zmizí. Bez klíče tunel vrací 401, klíč jde kdykoli vyměnit („New key“).
- Pohled přes tunel je jen ke čtení. Adresa se mění při restartu tunelu. Quick Tunnel nepodporuje SSE, proto dashboard používá polling.
- Named Tunnel + Cloudflare Access s vlastní doménou zůstává jako pozdější upgrade.

### Onboarding

1. Nainstalovat plugin (na hackathonu zkopírovat do `~/.cursor/plugins/local/`) a udělat „Reload Window“.
2. Spustit `/goally-setup`. Průvodce zkontroluje Node, vytvoří `~/.goally/` s konfigurací a lokálním tokenem a spustí daemon.
3. Grok: najde `grok`, nebo nabídne instalaci. Pak spustí `grok login` v prohlížeči a otestuje jeden headless běh.
4. Telefon (volitelné): `goally tunnel start` a naskenovat QR kód.
5. `goally doctor` na konci vše ověří: hook dorazil, MCP je připojené, Grok odpovídá, tunel je dostupný.

### Zabezpečení (jednoduše, ale podle standardu)

- Daemon poslouchá jen na `127.0.0.1`. Ven se dostane výhradně přes Quick Tunnel se soukromým klíčem, jen ke čtení.
- Hooky a MCP se k daemonu hlásí náhodným tokenem ze souboru `~/.goally/token` (práva `0600`). Požadavky s cizím `Origin` se odmítnou, aby do daemonu nemohla zapisovat cizí webová stránka.
- Na telefonu je dashboard jen ke čtení. Zásahy a změny jdou jen lokálně.
- Grok dozor má jen nástroje pro čtení, bez shellu a bez úprav souborů.
- Před uložením a před odesláním Grokovi se z výstupů příkazů odstraní tajné údaje (klíče, tokeny, `.env` hodnoty) a výstupy se zkrátí.
- Hooky při chybě nikdy neblokují práci. Blokovat umí jen paralelní limit a pauza mise (`subagentStart`).

### Zdroje (ověřeno, max. 3 měsíce staré nebo aktuální dokumentace)

- [Cursor Plugins](https://cursor.com/docs/plugins) a [Plugins reference](https://cursor.com/docs/reference/plugins)
- [Cursor Hooks](https://cursor.com/docs/hooks)
- [Cursor MCP a MCP Apps](https://cursor.com/docs/mcp)
- [Grok Build je open source (15. 7. 2026)](https://x.ai/news/grok-build-open-source), [headless režim](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md), [přihlášení](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/02-authentication.md)
- [Cloudflare Quick Tunnels (omezení)](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)
- [Cursor Desktop Bridge: `cursor desktop send` (RuntimeWire, 18. 8. 2026)](https://runtimewire.com/article/cursor-built-a-hidden-terminal-command-for-steering-its-desktop-ai-agents). Ověřeno i lokálně v Cursoru 3.22.12 (`desktop_bridge`, `composer.desktopBridge.sendMessage`).
- [cursor-bridge-mcp (CDP)](https://github.com/pandaxbacon/cursor-bridge-mcp), [nitech/auto](https://github.com/nitech/auto)
- [SpaceX design system (Refero)](https://styles.refero.design/style/13b74e34-b824-4d1d-bd2c-bb9bfbc2d6e1), [SpaceX tokeny (oh-my-design, 13. 7. 2026)](https://oh-my-design.kr/design-systems/spacex)

## Otevřené otázky

- Jazyk UI: **rozhodnuto, angličtina.**
- Tunel na telefon: **rozhodnuto, Quick Tunnel zdarma s automatickou adresou.**
- Název: Goally (rozhodnuto).

## Další kroky (po zelené)

1. Spike: prázdný plugin s hookem, který loguje `subagentStart` / `subagentStop`, a ověření skutečných polí ve tvé verzi Cursoru.
2. Zapnout Desktop Bridge a poslat zkušební zprávu přes `cursor desktop send` do této session.
3. Ověřit `grok -p` s tvým předplatným a JSON výstupem.
4. 3 vizuální směry boardu, ty jeden vybereš.
5. MVP: daemon + hooky + MCP + skill + dashboard, pak dozor Grok, pak tunel.

