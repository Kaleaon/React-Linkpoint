#!/usr/bin/env bash
# Install and start a real OpenSim 0.9.3.0 standalone grid on 127.0.0.1:9002 (login) / udp 9100 (region),
# with one account "Linky Tester" / "testpass1". Needs: .NET 8 SDK/runtime, libgdiplus, curl, unzip.
# Debian/Ubuntu: apt-get install -y dotnet-sdk-8.0 libgdiplus
set -euo pipefail
DIR=${1:-/tmp/opensim}
mkdir -p "$DIR" && cd "$DIR"
[ -f opensim-0.9.3.0.zip ] || curl -fsS -O http://opensimulator.org/dist/opensim-0.9.3.0.zip
[ -d opensim ] || unzip -q opensim-0.9.3.0.zip
cd opensim/bin
cp -n OpenSim.ini.example OpenSim.ini
cp -n config-include/StandaloneCommon.ini.example config-include/StandaloneCommon.ini
sed -i 's|^;\s*Include-Architecture = "config-include/Standalone.ini"|    Include-Architecture = "config-include/Standalone.ini"|' OpenSim.ini
sed -i 's|PublicPort = "9000"|PublicPort = "9002"|; s|^ *;* *http_listener_port = 9000|    http_listener_port = 9002|' OpenSim.ini
mkdir -p Regions
cat > Regions/Regions.ini <<'INI'
[Test Isle]
RegionUUID = 11111111-2222-3333-4444-aaaaaaaaaaaa
Location = 1000,1000
SizeX = 256
SizeY = 256
InternalAddress = 0.0.0.0
InternalPort = 9100
AllowAlternatePorts = False
ExternalHostName = 127.0.0.1
INI
rm -f *.db /tmp/os_in; mkfifo /tmp/os_in
nohup sh -c 'tail -f /tmp/os_in | dotnet OpenSim.dll -console=basic > /tmp/os.log 2>&1' >/dev/null 2>&1 &
# First-run prompts: estate name, owner first/last/password/email, then Enter for each remaining default.
sleep 40; printf 'Test Estate\nTest\nOwner\nownerpass\nowner@example.com\n' > /tmp/os_in
sleep 40; printf '\n' > /tmp/os_in
sleep 20; printf 'create user Linky Tester testpass1 linky@example.com\n' > /tmp/os_in
sleep 5; printf '\n\n' > /tmp/os_in
echo "OpenSim log: /tmp/os.log. Run the live test with:"
echo "  OPENSIM_LOGIN_URL=http://127.0.0.1:9002/ ./gradlew :core:test --tests '*OpenSimLiveTest*' -i"
