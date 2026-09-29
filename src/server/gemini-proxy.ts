import { GoogleGenAI } from "@google/genai";
import { v4 as uuidv4 } from "uuid";

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

export interface GeminiProxyLoginParams {
  firstName: string;
  lastName: string;
  gridName?: string;
  startLocation?: string;
  host?: string;
  protocol?: string;
}

export async function generateGeminiLoginResponse(params: GeminiProxyLoginParams): Promise<string> {
  const firstName = params.firstName || "Ruth";
  const lastName = params.lastName || "Resident";
  const agentId = uuidv4();
  const sessionId = uuidv4();
  const secureSessionId = uuidv4();
  const inventoryRootId = uuidv4();
  const circuitCode = Math.floor(1000 + Math.random() * 9000);
  const now = Math.floor(Date.now() / 1000);
  const host = params.host || "localhost:3000";
  const proto = params.protocol || (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');

  let welcomeMessage = "Welcome to Second Life via Linkpoint Gemini AI Grid Proxy!";

  if (process.env.GEMINI_API_KEY) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `You are the Second Life Grid Simulator. The avatar "${firstName} ${lastName}" is connecting to grid "${params.gridName || 'Agni'}".
Generate a brief, atmospheric 1-sentence welcome message suitable for an active Second Life resident arriving at "${params.startLocation || 'Welcome Island'}". Keep it under 20 words. No quotes.`,
      });
      if (response.text?.trim()) {
        welcomeMessage = response.text.trim();
      }
    } catch (err) {
      console.warn("[Gemini Proxy] LLM generation skipped, using standard greeting:", err);
    }
  }

  return `<?xml version="1.0"?>
<methodResponse>
  <params>
    <param>
      <value>
        <struct>
          <member><name>login</name><value><string>true</string></value></member>
          <member><name>first_name</name><value><string>${escapeXml(firstName)}</string></value></member>
          <member><name>last_name</name><value><string>${escapeXml(lastName)}</string></value></member>
          <member><name>agent_id</name><value><string>${agentId}</string></value></member>
          <member><name>session_id</name><value><string>${sessionId}</string></value></member>
          <member><name>secure_session_id</name><value><string>${secureSessionId}</string></value></member>
          <member><name>circuit_code</name><value><int>${circuitCode}</int></value></member>
          <member><name>sim_ip</name><value><string>127.0.0.1</string></value></member>
          <member><name>sim_port</name><value><int>9000</int></value></member>
          <member><name>seed_capability</name><value><string>${proto}://${host}/api/caps/${sessionId}/</string></value></member>
          <member><name>seconds_since_epoch</name><value><int>${now}</int></value></member>
          <member><name>start_location</name><value><string>${escapeXml(params.startLocation || 'last')}</string></value></member>
          <member><name>message</name><value><string>${escapeXml(welcomeMessage)}</string></value></member>
          <member><name>region_x</name><value><int>256000</int></value></member>
          <member><name>region_y</name><value><int>256000</int></value></member>
          <member><name>look_at</name><value><string>[r0.9,r0.1,r0.0]</string></value></member>
          <member>
            <name>inventory-root</name>
            <value>
              <array>
                <data>
                  <value>
                    <struct>
                      <member><name>folder_id</name><value><string>${inventoryRootId}</string></value></member>
                    </struct>
                  </value>
                </data>
              </array>
            </value>
          </member>
          <member>
            <name>login-flags</name>
            <value>
              <array>
                <data>
                  <value><struct><member><name>ever_logged_in</name><value><string>Y</string></value></member></struct></value>
                  <value><struct><member><name>daylight_savings</name><value><string>Y</string></value></member></struct></value>
                  <value><struct><member><name>stipend_since_login</name><value><string>N</string></value></member></struct></value>
                  <value><struct><member><name>gendered</name><value><string>Y</string></value></member></struct></value>
                </data>
              </array>
            </value>
          </member>
        </struct>
      </value>
    </param>
  </params>
</methodResponse>`;
}

export function escapeXml(unsafe: string): string {
  return String(unsafe || "")
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function parseLoginXmlCredentials(xmlText: string): { firstName: string; lastName: string; startLocation: string } {
  const firstMatch = xmlText.match(/<name>\s*first\s*<\/name>\s*<value>\s*<string>([^<]*)<\/string>/i);
  const lastMatch = xmlText.match(/<name>\s*last\s*<\/name>\s*<value>\s*<string>([^<]*)<\/string>/i);
  const startMatch = xmlText.match(/<name>\s*start\s*<\/name>\s*<value>\s*<string>([^<]*)<\/string>/i);

  return {
    firstName: firstMatch ? firstMatch[1].trim() : "Ruth",
    lastName: lastMatch ? lastMatch[1].trim() : "Resident",
    startLocation: startMatch ? startMatch[1].trim() : "last",
  };
}

export async function processLLSDWithGemini(llsdData: string, task: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return `Gemini API key is not configured. Input received: ${llsdData.slice(0, 100)}...`;
  }
  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash",
    contents: `You are an expert on Linden Lab Structured Data (LLSD) and the Second Life protocol.
Task: ${task}
LLSD Data:
${llsdData}`,
  });
  return response.text || "No response generated";
}

export async function generateSimulatedChat(prompt: string, speaker: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return `${speaker}: Welcome to the virtual world!`;
  }
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: `You are simulating a resident in Second Life named "${speaker}".
Respond naturally in local chat to: "${prompt}".
Keep it friendly, authentic to Second Life culture, and concise (1-2 sentences). No meta commentary.`,
    });
    return response.text?.trim() || `${speaker}: Looks great!`;
  } catch {
    return `${speaker}: Welcome to the region!`;
  }
}
