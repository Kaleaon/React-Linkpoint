#!/usr/bin/env python3
"""
Automated live tests against a REAL OpenSim, no manual steps.

    python3 tools/opensim/live.py            # generated OAR: login, terrain, prims, mesh, sculpt, textures, particles
    python3 tools/opensim/live.py --big      # also downloads (cached, 770 MB) and loads a real-world OAR, then runs the big-content test
    python3 tools/opensim/live.py --keep     # leave OpenSim running afterwards (port 9002), for poking at it
    python3 tools/opensim/live.py --oar PATH # additionally load your own OAR (.oar / .tgz) and run the big-content test on it

What it does: downloads OpenSim 0.9.3.0 (cached in ~/.cache/linkpoint-opensim), configures a standalone grid on login
port 9002 / UDP 9100, answers the first-run prompts, creates the account "Linky Tester" / "testpass1", builds a test OAR with
`./gradlew :mockgrid:runOar`, loads it, runs `OpenSimLiveTest` through Gradle, then stops OpenSim. Exit code = test result.

Needs: python3, java 17+, curl, unzip, .NET 8 runtime (`dotnet`) and libgdiplus
(Debian/Ubuntu: apt-get install -y dotnet-sdk-8.0 libgdiplus).
"""
import argparse, os, re, shutil, subprocess, sys, tarfile, time, urllib.request, zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CACHE = os.path.expanduser("~/.cache/linkpoint-opensim")
WORK = os.environ.get("OPENSIM_WORK", "/tmp/linkpoint-opensim")
VERSION = "0.9.3.0"
DIST = f"http://opensimulator.org/dist/opensim-{VERSION}.zip"
BIG_OAR = "https://www.outworldz.com/cgi/sculpt-save.plx?File=/Sculpts/cgi/files/OAR-Furniture_Vault(1X1).tgz"
LOGIN_PORT, UDP_PORT, REGION = 9002, 9100, "Test Isle"
USER, PASSWORD = "Linky Tester", "testpass1"

def log(*a): print("[live]", *a, flush=True)

def need(cmd, hint):
    if not shutil.which(cmd): sys.exit(f"missing '{cmd}': {hint}")

def download(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0: return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    log("downloading", url); tmp = dest + ".part"
    # curl honours the proxy settings of sandboxes and CI (urllib can ignore them and hang).
    if shutil.which("curl"):
        if subprocess.call(["curl", "-fsSL", "--retry", "3", "-m", "1800", "-o", tmp, url]) != 0: sys.exit(f"download failed: {url}")
    else:
        with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f: shutil.copyfileobj(r, f, 1 << 20)
    os.rename(tmp, dest); return dest

class OpenSim:
    def __init__(self):
        self.bin = os.path.join(WORK, "opensim", "bin"); self.logfile = os.path.join(WORK, "opensim.log"); self.proc = None; self.pos = 0

    def configure(self):
        with zipfile.ZipFile(download(DIST, os.path.join(CACHE, f"opensim-{VERSION}.zip"))) as z: z.extractall(WORK)
        b = self.bin
        shutil.copy(f"{b}/OpenSim.ini.example", f"{b}/OpenSim.ini")
        shutil.copy(f"{b}/config-include/StandaloneCommon.ini.example", f"{b}/config-include/StandaloneCommon.ini")
        ini = open(f"{b}/OpenSim.ini").read()
        ini = re.sub(r'^;\s*Include-Architecture = "config-include/Standalone.ini"', '    Include-Architecture = "config-include/Standalone.ini"', ini, flags=re.M)
        ini = ini.replace('PublicPort = "9000"', f'PublicPort = "{LOGIN_PORT}"')
        ini = re.sub(r'^\s*;*\s*http_listener_port = 9000', f'    http_listener_port = {LOGIN_PORT}', ini, flags=re.M)
        open(f"{b}/OpenSim.ini", "w").write(ini)
        os.makedirs(f"{b}/Regions", exist_ok=True)
        open(f"{b}/Regions/Regions.ini", "w").write(
            f"[{REGION}]\nRegionUUID = 11111111-2222-3333-4444-aaaaaaaaaaaa\nLocation = 1000,1000\nSizeX = 256\nSizeY = 256\n"
            f"InternalAddress = 0.0.0.0\nInternalPort = {UDP_PORT}\nAllowAlternatePorts = False\nExternalHostName = 127.0.0.1\n")

    def start(self):
        self.proc = subprocess.Popen(["dotnet", "OpenSim.dll", "-console=basic"], cwd=self.bin, stdin=subprocess.PIPE,
                                     stdout=open(self.logfile, "w"), stderr=subprocess.STDOUT, text=True, bufsize=1)

    def text(self): return open(self.logfile, errors="replace").read()

    def send(self, line): self.proc.stdin.write(line + "\n"); self.proc.stdin.flush()

    # Answers to the console's interactive prompts, matched against the end of the log.
    PROMPTS = [(r"New estate name \[.*\]: $", "Test Estate"), (r"Estate owner first name \[.*\]: $", "Test"),
               (r"Estate owner last name \[.*\]: $", "Owner"), (r"Password: $", "ownerpass"), (r"Email: $", "owner@example.com"),
               (r"User ID \(.*\) ?\[.*\]: $", ""), (r"User ID \[.*\]: $", ""), (r"Model name \[.*\]: $", "")]

    def wait(self, pattern, timeout=300, what=None):
        """Wait for a regex in new log output, answering known prompts as they appear."""
        end = time.time() + timeout; rx = re.compile(pattern)
        while time.time() < end:
            if self.proc.poll() is not None: sys.exit(f"OpenSim exited early (code {self.proc.returncode}); see {self.logfile}\n" + self.text()[-1500:])
            t = self.text()[self.pos:]
            m = rx.search(t)
            if m: self.pos += m.end(); return
            for p, ans in self.PROMPTS:
                if re.search(p, t[-200:]):
                    self.pos += len(t)  # consume exactly the prompt just answered; later output stays unread
                    self.send(ans); time.sleep(0.3)
                    break
            time.sleep(0.3)
        sys.exit(f"timed out waiting for {what or pattern}; see {self.logfile}\n" + self.text()[-1500:])

    def boot(self):
        self.start(); self.wait(r"Region \(%s\) # " % re.escape(REGION), 300, "OpenSim console")
        log("OpenSim is up")
        self.send(f"create user {USER} {PASSWORD} linky@example.com"); self.wait(r"created successfully", 60, "account creation")
        log("account created:", USER)

    def load_oar(self, path, merge):
        flags = "--merge" if merge else "--force-terrain --force-parcels"
        self.send(f'change region "{REGION}"'); self.send(f'load oar {flags} "{path}"')
        self.wait(r"Successfully loaded archive", 900, "OAR load")
        m = re.findall(r"Loaded (\d+) scene objects", self.text()); log("OAR loaded:", path, f"({m[-1]} objects)" if m else "")
        time.sleep(3)

    def stop(self):
        if self.proc and self.proc.poll() is None:
            try: self.send("quit"); self.proc.wait(30)
            except Exception: self.proc.kill()

def gradle(*args, env=None):
    return subprocess.call([os.path.join(ROOT, "gradlew"), *args], cwd=ROOT, env=dict(os.environ, **(env or {})))

def oar_asset_ids(path):
    """Ids of assets a .tgz/.oar actually contains (archives often omit assets they reference); cached next to the file."""
    out = path + ".ids"
    if not os.path.exists(out):
        log("indexing archive assets (once)"); ids = set()
        with tarfile.open(path, "r:gz") as t:
            for m in t:
                if m.name.startswith("assets/"): ids.add(os.path.basename(m.name).split("_")[0])
        open(out, "w").write("\n".join(sorted(ids)))
    return out

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--big", action="store_true"); ap.add_argument("--keep", action="store_true"); ap.add_argument("--oar")
    ap.add_argument("--meshes", default="1200"); ap.add_argument("--textures", default="400"); ap.add_argument("--sculpts", default="100")
    a = ap.parse_args()
    need("dotnet", ".NET 8 runtime, e.g. apt-get install -y dotnet-sdk-8.0"); need("java", "JDK 17+")
    if subprocess.run("ldconfig -p | grep -q gdiplus", shell=True).returncode != 0:
        sys.exit("missing libgdiplus (apt-get install -y libgdiplus); OpenSim cannot start without it")
    shutil.rmtree(WORK, ignore_errors=True); os.makedirs(WORK)
    gen = os.path.join(WORK, "linkpoint-test.oar")
    if gradle("-q", ":mockgrid:runOar", f"--args={gen}") != 0: sys.exit("could not build the test OAR")
    sim = OpenSim(); sim.configure(); rc = 1
    env = {"OPENSIM_LOGIN_URL": f"http://127.0.0.1:{LOGIN_PORT}/", "OPENSIM_USER": USER, "OPENSIM_PASSWORD": PASSWORD}
    try:
        sim.boot(); sim.load_oar(gen, merge=True)
        rc = gradle(":core:test", "--tests", "*OpenSimLiveTest*", "--rerun-tasks", "-i", env=env)  # prints LIVE lines
        big = a.oar
        if a.big and not big: big = download(BIG_OAR, os.path.join(CACHE, "OAR-Furniture_Vault(1X1).tgz"))
        if big and rc == 0:
            sim.load_oar(big, merge=False)
            ids = oar_asset_ids(big) if big.endswith((".tgz", ".gz", ".oar")) else None
            e2 = dict(env, OPENSIM_BIG="1", MESHES=a.meshes, TEXTURES=a.textures, SCULPTS=a.sculpts, **({"OPENSIM_ASSET_IDS": ids} if ids else {}))
            rc = gradle(":core:test", "--tests", "*OpenSimLiveTest.realWorld*", "--rerun-tasks", "-i", env=e2)
    finally:
        if a.keep: log(f"leaving OpenSim running: login http://127.0.0.1:{LOGIN_PORT}/  user '{USER}' / '{PASSWORD}'  log {sim.logfile}")
        else: sim.stop()
    log("RESULT:", "PASS" if rc == 0 else "FAIL"); sys.exit(rc)

if __name__ == "__main__": main()
