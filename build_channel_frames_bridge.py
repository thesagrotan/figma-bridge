import urllib.request
import json
import time

TOKEN = '870dd653deb89ed45aacbf4e898711ac5cd4e4746e7fd441f5fd66e71eeaa91c'
URL = 'http://127.0.0.1:31337'

def bridge_cmd(ops):
    req = urllib.request.Request(
        f'{URL}/command',
        data=json.dumps({'ops': ops}).encode('utf8'),
        headers={'Content-Type': 'application/json', 'X-Bridge-Token': TOKEN}
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode('utf8'))
    cmd_id = res['id']
    req_res = urllib.request.Request(
        f'{URL}/results?id={cmd_id}&wait=15',
        headers={'X-Bridge-Token': TOKEN}
    )
    with urllib.request.urlopen(req_res) as resp:
        return json.loads(resp.read().decode('utf8'))

print("--- Step 1: Querying existing layout page frames ---")
tree_res = bridge_cmd([{'action': 'tree', 'nodeId': '96:5732', 'depth': 1}])
children = tree_res['result']['results'][0]['result']['root']['children']

# Check and remove any previously generated channel frames
names_to_clean = [
    "model — channel view (single channel)",
    "model — channel management (directory)",
    "model — broadcast detail (from channel)"
]

for child in children:
    for target_name in names_to_clean:
        if child['name'].startswith(target_name):
            print(f"Removing old frame {child['name']} ({child['id']})")
            bridge_cmd([{'action': 'delete', 'nodeId': child['id']}])

time.sleep(0.5)

# SVG Content for Frame 1: Single Channel View
svg_channel_view = """<svg width="422" height="630" viewBox="0 0 422 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Nav Header -->
  <text x="0" y="19" fill="#007AFF" font-family="Inter, -apple-system, sans-serif" font-size="14" font-weight="500">‹ Feed</text>
  <rect x="336" y="2" width="86" height="22" rx="6" fill="#EEEEF0"/>
  <text x="379" y="17" fill="#73737C" font-family="Inter, -apple-system, sans-serif" font-size="11" font-weight="500" text-anchor="middle">Channel View</text>

  <!-- Channel Header Card -->
  <rect x="0" y="38" width="422" height="76" rx="10" fill="#F5F9FF" stroke="#B8D5FF" stroke-width="1"/>
  <rect x="14" y="52" width="48" height="48" rx="10" fill="#2B70BF"/>
  <text x="72" y="70" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="15" font-weight="600">Bloomberg Television</text>
  <text x="72" y="87" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11">bloomberg.com/live • English • Finance / Markets</text>
  <rect x="72" y="93" width="58" height="18" rx="5" fill="#E8E8EB"/>
  <circle cx="81" cy="102" r="3" fill="#34C759"/>
  <text x="88" y="106" fill="#4A4A52" font-family="Inter, -apple-system, sans-serif" font-size="11" font-weight="500">Active</text>
  <rect x="366" y="52" width="42" height="26" rx="6" fill="#EBEBED"/>
  <text x="387" y="69" fill="#4A4A52" font-family="Inter, -apple-system, sans-serif" font-size="12" font-weight="500" text-anchor="middle">Edit</text>

  <!-- Auto-Follow Setting Row -->
  <rect x="0" y="124" width="422" height="52" rx="10" fill="#FAFAFC" stroke="#E5E5EA" stroke-width="1"/>
  <text x="14" y="146" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="13" font-weight="500">Auto-follow new live broadcasts</text>
  <text x="14" y="163" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11">Automatically ingest new streams from this channel</text>
  <rect x="372" y="139" width="36" height="22" rx="11" fill="#34C759"/>
  <circle cx="397" cy="150" r="9" fill="#FFFFFF"/>

  <!-- Broadcasts Section Header -->
  <text x="0" y="202" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11" font-weight="600" letter-spacing="0.5">BROADCASTS</text>
  <text x="422" y="202" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11" text-anchor="end">1 live · 4 past</text>

  <!-- Live Broadcast Row -->
  <rect x="0" y="214" width="422" height="66" rx="10" fill="#FFF2F2" stroke="#FF453A" stroke-width="1" stroke-opacity="0.3"/>
  <text x="14" y="238" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="13" font-weight="600">Markets Open — Fed Rate Decision Special</text>
  <rect x="364" y="226" width="44" height="18" rx="5" fill="#FFE5E5" stroke="#FF453A" stroke-width="1" stroke-opacity="0.3"/>
  <circle cx="374" cy="235" r="3" fill="#FF453A"/>
  <text x="391" y="239" fill="#FF453A" font-family="Inter, -apple-system, sans-serif" font-size="10" font-weight="700" text-anchor="middle">LIVE</text>
  <text x="14" y="261" fill="#52525A" font-family="Inter, -apple-system, sans-serif" font-size="11">Started 14:00 · 47 insights extracted · Tap to open transcript</text>

  <!-- Past Broadcast 1 -->
  <rect x="0" y="290" width="422" height="52" rx="8" fill="#FAFAFC" stroke="#EBEBED" stroke-width="1"/>
  <rect x="12" y="302" width="28" height="28" rx="6" fill="#EEEEF0"/>
  <rect x="18" y="312" width="2" height="8" rx="1" fill="#A0A0A5"/>
  <rect x="22" y="307" width="2" height="18" rx="1" fill="#A0A0A5"/>
  <rect x="26" y="310" width="2" height="12" rx="1" fill="#A0A0A5"/>
  <rect x="30" y="314" width="2" height="4" rx="1" fill="#A0A0A5"/>
  <text x="48" y="319" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="13" font-weight="500">Powell Presser — September 2025</text>
  <text x="48" y="334" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11">Sep 18 · 2:04:12 · 134 insights</text>
  <text x="408" y="324" fill="#B0B0B5" font-family="Inter, -apple-system, sans-serif" font-size="16" text-anchor="end">›</text>

  <!-- Past Broadcast 2 -->
  <rect x="0" y="350" width="422" height="52" rx="8" fill="#FAFAFC" stroke="#EBEBED" stroke-width="1"/>
  <rect x="12" y="362" width="28" height="28" rx="6" fill="#EEEEF0"/>
  <rect x="18" y="373" width="2" height="6" rx="1" fill="#A0A0A5"/>
  <rect x="22" y="367" width="2" height="18" rx="1" fill="#A0A0A5"/>
  <rect x="26" y="370" width="2" height="12" rx="1" fill="#A0A0A5"/>
  <rect x="30" y="375" width="2" height="3" rx="1" fill="#A0A0A5"/>
  <text x="48" y="379" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="13" font-weight="500">CPI Data Reaction: Live Markets</text>
  <text x="48" y="394" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11">Sep 11 · 1:22:08 · 89 insights</text>
  <text x="408" y="384" fill="#B0B0B5" font-family="Inter, -apple-system, sans-serif" font-size="16" text-anchor="end">›</text>

  <!-- Past Broadcast 3 -->
  <rect x="0" y="410" width="422" height="52" rx="8" fill="#FAFAFC" stroke="#EBEBED" stroke-width="1"/>
  <rect x="12" y="422" width="28" height="28" rx="6" fill="#EEEEF0"/>
  <rect x="18" y="432" width="2" height="8" rx="1" fill="#A0A0A5"/>
  <rect x="22" y="427" width="2" height="18" rx="1" fill="#A0A0A5"/>
  <rect x="26" y="431" width="2" height="10" rx="1" fill="#A0A0A5"/>
  <rect x="30" y="434" width="2" height="4" rx="1" fill="#A0A0A5"/>
  <text x="48" y="439" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="13" font-weight="500">Jobs Report Special Coverage</text>
  <text x="48" y="454" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11">Sep 4 · 0:58:34 · 61 insights</text>
  <text x="408" y="444" fill="#B0B0B5" font-family="Inter, -apple-system, sans-serif" font-size="16" text-anchor="end">›</text>

  <!-- Past Broadcast 4 -->
  <rect x="0" y="470" width="422" height="52" rx="8" fill="#FAFAFC" stroke="#EBEBED" stroke-width="1"/>
  <rect x="12" y="482" width="28" height="28" rx="6" fill="#EEEEF0"/>
  <rect x="18" y="493" width="2" height="6" rx="1" fill="#A0A0A5"/>
  <rect x="22" y="487" width="2" height="18" rx="1" fill="#A0A0A5"/>
  <rect x="26" y="490" width="2" height="12" rx="1" fill="#A0A0A5"/>
  <rect x="30" y="494" width="2" height="5" rx="1" fill="#A0A0A5"/>
  <text x="48" y="499" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="13" font-weight="500">FOMC Minutes Release</text>
  <text x="48" y="514" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11">Aug 21 · 0:44:17 · 43 insights</text>
  <text x="408" y="504" fill="#B0B0B5" font-family="Inter, -apple-system, sans-serif" font-size="16" text-anchor="end">›</text>
</svg>"""

# SVG Content for Frame 2: Channel Management (Directory)
svg_management = """<svg width="422" height="630" viewBox="0 0 422 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Panel Header -->
  <text x="0" y="21" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="18" font-weight="600">Channels</text>
  <rect x="314" y="2" width="108" height="28" rx="7" fill="#007AFF"/>
  <text x="368" y="20" fill="#FFFFFF" font-family="Inter, -apple-system, sans-serif" font-size="12" font-weight="600" text-anchor="middle">+ Add Channel</text>

  <!-- Filter Tabs -->
  <rect x="0" y="40" width="48" height="26" rx="7" fill="#007AFF"/>
  <text x="24" y="57" fill="#FFFFFF" font-family="Inter, -apple-system, sans-serif" font-size="12" font-weight="600" text-anchor="middle">All</text>
  
  <rect x="54" y="40" width="62" height="26" rx="7" fill="#EEEEF0"/>
  <text x="85" y="57" fill="#4A4A52" font-family="Inter, -apple-system, sans-serif" font-size="12" text-anchor="middle">Active</text>
  
  <rect x="122" y="40" width="64" height="26" rx="7" fill="#EEEEF0"/>
  <text x="154" y="57" fill="#4A4A52" font-family="Inter, -apple-system, sans-serif" font-size="12" text-anchor="middle">Paused</text>
  
  <rect x="192" y="40" width="76" height="26" rx="7" fill="#EEEEF0"/>
  <text x="230" y="57" fill="#4A4A52" font-family="Inter, -apple-system, sans-serif" font-size="12" text-anchor="middle">Archived</text>

  <!-- Search Bar -->
  <rect x="0" y="76" width="422" height="32" rx="8" fill="#FAFAFC" stroke="#E5E5EA" stroke-width="1"/>
  <text x="12" y="97" fill="#A0A0A5" font-family="Inter, -apple-system, sans-serif" font-size="14">⌕</text>
  <text x="30" y="97" fill="#A0A0A5" font-family="Inter, -apple-system, sans-serif" font-size="13">Search channels…</text>

  <!-- Channel Row 1: Bloomberg -->
  <rect x="0" y="118" width="422" height="60" rx="10" fill="#FAFAFC" stroke="#E5E5EA" stroke-width="1"/>
  <rect x="12" y="130" width="36" height="36" rx="8" fill="#2B70BF"/>
  <text x="58" y="146" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="13" font-weight="600">Bloomberg Television</text>
  <circle cx="63" cy="158" r="3" fill="#FF453A"/>
  <text x="70" y="162" fill="#FF453A" font-family="Inter, -apple-system, sans-serif" font-size="11">Live now</text>
  <text x="114" y="162" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11">·  ~42 insights/hr</text>
  <rect x="350" y="137" width="36" height="22" rx="11" fill="#34C759"/>
  <circle cx="375" cy="148" r="9" fill="#FFFFFF"/>
  <text x="408" y="152" fill="#B0B0B5" font-family="Inter, -apple-system, sans-serif" font-size="16" text-anchor="end">›</text>

  <!-- Channel Row 2: CNBC -->
  <rect x="0" y="186" width="422" height="60" rx="10" fill="#FAFAFC" stroke="#E5E5EA" stroke-width="1"/>
  <rect x="12" y="198" width="36" height="36" rx="8" fill="#2E8A57"/>
  <text x="58" y="214" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="13" font-weight="600">CNBC</text>
  <circle cx="63" cy="226" r="3" fill="#FF453A"/>
  <text x="70" y="230" fill="#FF453A" font-family="Inter, -apple-system, sans-serif" font-size="11">Live now</text>
  <text x="114" y="230" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11">·  ~28 insights/hr</text>
  <rect x="350" y="205" width="36" height="22" rx="11" fill="#34C759"/>
  <circle cx="375" cy="216" r="9" fill="#FFFFFF"/>
  <text x="408" y="220" fill="#B0B0B5" font-family="Inter, -apple-system, sans-serif" font-size="16" text-anchor="end">›</text>

  <!-- Channel Row 3: Federal Reserve -->
  <rect x="0" y="254" width="422" height="60" rx="10" fill="#FAFAFC" stroke="#E5E5EA" stroke-width="1"/>
  <rect x="12" y="266" width="36" height="36" rx="8" fill="#C73838"/>
  <text x="58" y="282" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="13" font-weight="600">Federal Reserve Press Feed</text>
  <text x="58" y="298" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11">Last: 11:00  ·  ~15 insights/hr</text>
  <rect x="350" y="273" width="36" height="22" rx="11" fill="#34C759"/>
  <circle cx="375" cy="284" r="9" fill="#FFFFFF"/>
  <text x="408" y="288" fill="#B0B0B5" font-family="Inter, -apple-system, sans-serif" font-size="16" text-anchor="end">›</text>

  <!-- Channel Row 4: C-SPAN (Paused) -->
  <rect x="0" y="322" width="422" height="60" rx="10" fill="#FAFAFC" stroke="#E5E5EA" stroke-width="1"/>
  <rect x="12" y="334" width="36" height="36" rx="8" fill="#852E9E"/>
  <text x="58" y="350" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="13" font-weight="600">C-SPAN</text>
  <text x="58" y="366" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11">Paused  ·  —</text>
  <rect x="350" y="341" width="36" height="22" rx="11" fill="#D1D1D6"/>
  <circle cx="361" cy="352" r="9" fill="#FFFFFF"/>
  <text x="408" y="356" fill="#B0B0B5" font-family="Inter, -apple-system, sans-serif" font-size="16" text-anchor="end">›</text>

  <!-- Channel Row 5: Reuters -->
  <rect x="0" y="390" width="422" height="60" rx="10" fill="#FAFAFC" stroke="#E5E5EA" stroke-width="1"/>
  <rect x="12" y="402" width="36" height="36" rx="8" fill="#E68C1A"/>
  <text x="58" y="418" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="13" font-weight="600">Reuters Live Briefings</text>
  <circle cx="63" cy="430" r="3" fill="#FF453A"/>
  <text x="70" y="434" fill="#FF453A" font-family="Inter, -apple-system, sans-serif" font-size="11">Live now</text>
  <text x="114" y="434" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11">·  ~9 insights/hr</text>
  <rect x="350" y="409" width="36" height="22" rx="11" fill="#34C759"/>
  <circle cx="375" cy="420" r="9" fill="#FFFFFF"/>
  <text x="408" y="424" fill="#B0B0B5" font-family="Inter, -apple-system, sans-serif" font-size="16" text-anchor="end">›</text>

  <!-- Summary Footer Card -->
  <rect x="0" y="462" width="422" height="44" rx="8" fill="#F5F9FF" stroke="#B8D5FF" stroke-width="1"/>
  <text x="14" y="489" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="12" font-weight="500">4 channels active</text>
  <text x="408" y="489" fill="#52525A" font-family="Inter, -apple-system, sans-serif" font-size="12" text-anchor="end">~94 insights / hr total</text>
</svg>"""

# SVG Content for Frame 3: Broadcast Detail (from Channel View)
svg_broadcast_detail = """<svg width="422" height="630" viewBox="0 0 422 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Nav Header -->
  <text x="0" y="19" fill="#007AFF" font-family="Inter, -apple-system, sans-serif" font-size="14" font-weight="500">‹ Bloomberg Television</text>
  <rect x="350" y="2" width="72" height="22" rx="6" fill="#EEEEF0"/>
  <text x="386" y="17" fill="#73737C" font-family="Inter, -apple-system, sans-serif" font-size="11" font-weight="500" text-anchor="middle">Broadcast</text>

  <!-- Broadcast Header Card -->
  <rect x="0" y="38" width="422" height="80" rx="10" fill="#F5F9FF" stroke="#B8D5FF" stroke-width="1"/>
  <text x="14" y="62" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="14" font-weight="600">Markets Open — Fed Rate Decision Special</text>
  <rect x="364" y="48" width="44" height="18" rx="5" fill="#FFE5E5" stroke="#FF453A" stroke-width="1" stroke-opacity="0.3"/>
  <circle cx="374" cy="57" r="3" fill="#FF453A"/>
  <text x="391" y="61" fill="#FF453A" font-family="Inter, -apple-system, sans-serif" font-size="10" font-weight="700" text-anchor="middle">LIVE</text>
  <text x="14" y="80" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11">Bloomberg Television • Started 14:00 today • 134 insights</text>
  <!-- Progress bar -->
  <rect x="14" y="94" width="394" height="4" rx="2" fill="#E5E5EA"/>
  <rect x="14" y="94" width="260" height="4" rx="2" fill="#007AFF"/>

  <!-- Section Header -->
  <text x="0" y="142" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11" font-weight="600" letter-spacing="0.5">INSIGHT TIMELINE</text>
  <rect x="220" y="128" width="36" height="20" rx="5" fill="#007AFF"/>
  <text x="238" y="142" fill="#FFFFFF" font-family="Inter, -apple-system, sans-serif" font-size="10" font-weight="600" text-anchor="middle">All</text>
  <rect x="260" y="128" width="56" height="20" rx="5" fill="#EEEEF0"/>
  <text x="288" y="142" fill="#4A4A52" font-family="Inter, -apple-system, sans-serif" font-size="10" text-anchor="middle">Monetary</text>
  <rect x="320" y="128" width="50" height="20" rx="5" fill="#EEEEF0"/>
  <text x="345" y="142" fill="#4A4A52" font-family="Inter, -apple-system, sans-serif" font-size="10" text-anchor="middle">Market</text>
  <rect x="374" y="128" width="48" height="20" rx="5" fill="#EEEEF0"/>
  <text x="398" y="142" fill="#4A4A52" font-family="Inter, -apple-system, sans-serif" font-size="10" text-anchor="middle">Geo</text>

  <!-- Timeline Item 1 (Selected) -->
  <rect x="0" y="156" width="422" height="82" rx="10" fill="#F5F9FF" stroke="#007AFF" stroke-width="1.5"/>
  <text x="14" y="178" fill="#007AFF" font-family="Inter, -apple-system, sans-serif" font-size="11" font-weight="600">14:32</text>
  <line x1="28" y1="184" x2="28" y2="230" stroke="#B8D5FF" stroke-width="1.5" stroke-dasharray="2 2"/>
  <rect x="52" y="166" width="94" height="18" rx="4" fill="#E8F2FF"/>
  <text x="99" y="179" fill="#007AFF" font-family="Inter, -apple-system, sans-serif" font-size="10" font-weight="500" text-anchor="middle">Monetary Policy</text>
  <text x="52" y="198" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="12">Federal Reserve signals pause on benchmark rate adjustments...</text>
  <rect x="52" y="208" width="76" height="20" rx="4" fill="#007AFF"/>
  <text x="90" y="222" fill="#FFFFFF" font-family="Inter, -apple-system, sans-serif" font-size="10" font-weight="600" text-anchor="middle">View Source</text>
  <rect x="134" y="208" width="84" height="20" rx="4" fill="#E8E8EB"/>
  <text x="176" y="222" fill="#4A4A52" font-family="Inter, -apple-system, sans-serif" font-size="10" font-weight="500" text-anchor="middle">Pin to Canvas</text>

  <!-- Timeline Item 2 -->
  <rect x="0" y="246" width="422" height="70" rx="10" fill="#FAFAFC" stroke="#EBEBED" stroke-width="1"/>
  <text x="14" y="268" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11" font-weight="600">14:28</text>
  <line x1="28" y1="274" x2="28" y2="310" stroke="#E5E5EA" stroke-width="1.5" stroke-dasharray="2 2"/>
  <rect x="52" y="256" width="92" height="18" rx="4" fill="#EEEEF0"/>
  <text x="98" y="269" fill="#4A4A52" font-family="Inter, -apple-system, sans-serif" font-size="10" font-weight="500" text-anchor="middle">Market Reaction</text>
  <text x="52" y="288" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="12">2-year Treasury yields dip 4 bps as traders reprice rate-cut probability</text>
  <text x="52" y="304" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11">for Q1; dollar index slips against major currencies.</text>

  <!-- Timeline Item 3 -->
  <rect x="0" y="324" width="422" height="70" rx="10" fill="#FAFAFC" stroke="#EBEBED" stroke-width="1"/>
  <text x="14" y="346" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11" font-weight="600">14:20</text>
  <line x1="28" y1="352" x2="28" y2="388" stroke="#E5E5EA" stroke-width="1.5" stroke-dasharray="2 2"/>
  <rect x="52" y="334" width="94" height="18" rx="4" fill="#EEEEF0"/>
  <text x="99" y="347" fill="#4A4A52" font-family="Inter, -apple-system, sans-serif" font-size="10" font-weight="500" text-anchor="middle">Monetary Policy</text>
  <text x="52" y="366" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="12">Powell reiterates 'data-dependent' stance — no preset course for</text>
  <text x="52" y="382" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11">remainder of 2025 until inflation consistently tracks 2% target.</text>

  <!-- Timeline Item 4 -->
  <rect x="0" y="402" width="422" height="70" rx="10" fill="#FAFAFC" stroke="#EBEBED" stroke-width="1"/>
  <text x="14" y="424" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11" font-weight="600">14:11</text>
  <line x1="28" y1="430" x2="28" y2="466" stroke="#E5E5EA" stroke-width="1.5" stroke-dasharray="2 2"/>
  <rect x="52" y="412" width="92" height="18" rx="4" fill="#EEEEF0"/>
  <text x="98" y="425" fill="#4A4A52" font-family="Inter, -apple-system, sans-serif" font-size="10" font-weight="500" text-anchor="middle">Market Reaction</text>
  <text x="52" y="444" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="12">S&amp;P 500 futures turn positive; equities traders absorb dovish tilt</text>
  <text x="52" y="460" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11">in FOMC committee opening statement.</text>

  <!-- Timeline Item 5 -->
  <rect x="0" y="480" width="422" height="66" rx="10" fill="#FAFAFC" stroke="#EBEBED" stroke-width="1"/>
  <text x="14" y="502" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11" font-weight="600">14:02</text>
  <rect x="52" y="490" width="76" height="18" rx="4" fill="#EEEEF0"/>
  <text x="90" y="503" fill="#4A4A52" font-family="Inter, -apple-system, sans-serif" font-size="10" font-weight="500" text-anchor="middle">Geopolitical</text>
  <text x="52" y="522" fill="#1A1A1E" font-family="Inter, -apple-system, sans-serif" font-size="12">Chair references global supply disruptions as an ongoing risk factor</text>
  <text x="52" y="538" fill="#808087" font-family="Inter, -apple-system, sans-serif" font-size="11">to baseline monetary outlook.</text>
</svg>"""

frames_to_create = [
    {
        "name": "model — channel view (single channel)",
        "x": 1960,
        "y": 1362,
        "svg": svg_channel_view,
        "feed_name": "ChannelViewContent"
    },
    {
        "name": "model — channel management (directory)",
        "x": 2920,
        "y": 1362,
        "svg": svg_management,
        "feed_name": "ChannelManagementContent"
    },
    {
        "name": "model — broadcast detail (from channel)",
        "x": 3880,
        "y": 1362,
        "svg": svg_broadcast_detail,
        "feed_name": "BroadcastDetailContent"
    }
]

created_frame_ids = []

for idx, f_spec in enumerate(frames_to_create):
    print(f"\n--- Building Frame {idx+1}: {f_spec['name']} at x={f_spec['x']} ---")
    
    # Duplicate base detail frame (102:239)
    dup_res = bridge_cmd([{'action': 'duplicate', 'nodeId': '102:239', 'x': f_spec['x'], 'y': f_spec['y']}])
    new_frame_id = dup_res['result']['results'][0]['result']['id']
    created_frame_ids.append(new_frame_id)
    print(f"Duplicated frame ID: {new_frame_id}")
    
    # Rename frame
    bridge_cmd([{'action': 'rename', 'nodeId': new_frame_id, 'name': f_spec['name']}])
    
    # Inspect children to locate left column (Frame 5)
    f_tree = bridge_cmd([{'action': 'tree', 'nodeId': new_frame_id, 'depth': 2}])
    f_children = f_tree['result']['results'][0]['result']['root']['children']
    
    left_col_id = None
    for c in f_children:
        if c.get('name') == 'Frame 5' or (c.get('x') == 25 and c.get('width') == 422):
            left_col_id = c['id']
            break
            
    if not left_col_id:
        print(f"Warning: could not locate left column in {new_frame_id}")
        continue
        
    print(f"Found left column frame: {left_col_id}")
    
    # Delete children inside left column
    col_tree = bridge_cmd([{'action': 'tree', 'nodeId': left_col_id, 'depth': 1}])
    col_children = col_tree['result']['results'][0]['result']['root']['children']
    del_ops = [{'action': 'delete', 'nodeId': c['id']} for c in col_children]
    if del_ops:
        bridge_cmd(del_ops)
        print(f"Cleaned {len(del_ops)} previous elements from left column")
        
    # Insert new SVG content
    svg_res = bridge_cmd([{
        'action': 'svg',
        'svg': f_spec['svg'],
        'name': f_spec['feed_name'],
        'parentId': left_col_id,
        'x': 0,
        'y': 0
    }])
    print(f"Inserted SVG content: {svg_res['ok']}")

# Select all frames and zoom
print("\n--- Zooming viewport to show all frames ---")
all_frames = ['96:5738', '102:239'] + created_frame_ids
bridge_cmd([{'action': 'select', 'nodeIds': all_frames, 'scroll': True}])

print("\nAll 3 frames built successfully and selected in Figma!")
