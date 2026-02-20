#!/bin/bash
# /srv/docker/scripts/tcpshield-firewall.sh

VELOCITY_PORT=25556
BACKEND_PORTS="25567 25568"

echo "$(date): Starting firewall update"

# --- Flush old backend rules ---
REMOVED=0
while iptables -L DOCKER-USER -n --line-numbers 2>/dev/null | grep "backend-" | head -1 | grep -q "backend-"; do
    LINE=$(iptables -L DOCKER-USER -n --line-numbers | grep "backend-" | head -1 | awk '{print $1}')
    iptables -D DOCKER-USER $LINE
    REMOVED=$((REMOVED + 1))
done
echo "  Removed $REMOVED old backend rules"

# --- Flush old TCPShield rules ---
REMOVED=0
while iptables -L DOCKER-USER -n --line-numbers 2>/dev/null | grep "tcpshield" | head -1 | grep -q tcpshield; do
    LINE=$(iptables -L DOCKER-USER -n --line-numbers | grep "tcpshield" | head -1 | awk '{print $1}')
    iptables -D DOCKER-USER $LINE
    REMOVED=$((REMOVED + 1))
done
echo "  Removed $REMOVED old tcpshield rules"

# --- Backend port protection ---
for port in $BACKEND_PORTS; do
    iptables -I DOCKER-USER -p tcp --dport $port -j DROP -m comment --comment "backend-drop"
    iptables -I DOCKER-USER -p tcp --dport $port -s 172.21.0.0/16 -j ACCEPT -m comment --comment "backend-allow-pelican"
    iptables -I DOCKER-USER -p tcp --dport $port -s 127.0.0.0/8 -j ACCEPT -m comment --comment "backend-allow-local"
    echo "  Protected backend port $port (pelican_nw + localhost only)"
done

# --- TCPShield IP whitelisting ---
echo "  Fetching TCPShield IP ranges from https://tcpshield.com/v4..."
RAW=$(curl -sL https://tcpshield.com/v4)

TCPSHIELD_IPS=$(echo "$RAW" | grep -Eo '([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}')

if [ -z "$TCPSHIELD_IPS" ]; then
    echo "  ERROR: Failed to fetch valid TCPShield IPs! Falling back to hardcoded ranges."
    TCPSHIELD_IPS="198.178.119.0/24 104.234.6.0/24"
fi

echo "  TCPShield ranges: $TCPSHIELD_IPS"

# Default drop rule for Velocity port
iptables -I DOCKER-USER -p tcp --dport $VELOCITY_PORT -j DROP -m comment --comment "tcpshield-drop"
echo "  Added DROP rule for port $VELOCITY_PORT"

# Allow each TCPShield range
ADDED=0
for ip in $TCPSHIELD_IPS; do
    iptables -I DOCKER-USER -p tcp --dport $VELOCITY_PORT -s "$ip" -j ACCEPT -m comment --comment "tcpshield"
    echo "  Allowed $ip"
    ADDED=$((ADDED + 1))
done

# Allow localhost (MOTD cache)
iptables -I DOCKER-USER -p tcp --dport $VELOCITY_PORT -s 127.0.0.0/8 -j ACCEPT -m comment --comment "tcpshield"
echo "  Allowed 127.0.0.0/8 (localhost/MOTD cache)"

echo ""
echo "$(date): Done. $ADDED TCPShield ranges whitelisted. Backend ports protected: $BACKEND_PORTS"

# Show final rules
echo ""
echo "  Current DOCKER-USER rules:"
iptables -L DOCKER-USER -n -v | grep -E "tcpshield|backend-"
