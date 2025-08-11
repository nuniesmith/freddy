#!/usr/bin/env bash

# FREDDY stack startup script
# Modeled after FKS start script: env detection, prereq checks, .env bootstrap, pull/up, and quick health checks

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
ENV_FILE="$PROJECT_ROOT/.env"

COMPOSE_CMD=""

log() {
	local level="$1"; shift
	case "$level" in
		INFO)  echo -e "${GREEN}[INFO]${NC} $*" ;;
		WARN)  echo -e "${YELLOW}[WARN]${NC} $*" ;;
		ERROR) echo -e "${RED}[ERROR]${NC} $*" ;;
		DEBUG) echo -e "${BLUE}[DEBUG]${NC} $*" ;;
	esac
}

detect_environment() {
	# Cloud/container markers
	if [[ -f /etc/cloud-id || -f /var/lib/cloud/data/instance-id || -n "${AWS_INSTANCE_ID:-}" || -n "${GCP_PROJECT:-}" || -n "${AZURE_SUBSCRIPTION_ID:-}" ]]; then
		echo cloud; return
	fi
	if [[ -f /.dockerenv || -n "${KUBERNETES_SERVICE_HOST:-}" ]]; then
		echo container; return
	fi
	# Memory check
	if command -v free >/dev/null 2>&1; then
		local mem; mem=$(free -m | awk '/^Mem:/{print $2}')
		if [[ -n "$mem" && "$mem" -lt 2048 ]]; then echo resource_constrained; return; fi
	fi
	# Hostname heuristic
	local hn; hn=$(hostname || true)
	if [[ "$hn" =~ (dev|staging|cloud|vps|server) ]]; then echo dev_server; return; fi
	# Markers
	if [[ -f "$HOME/.laptop" || -f "$PROJECT_ROOT/.local" ]]; then echo laptop; return; fi
	echo laptop
}

DETECTED_ENV=$(detect_environment)

check_prerequisites() {
	log INFO "Checking prerequisites..."
	if ! command -v docker >/dev/null 2>&1; then
		log ERROR "Docker is not installed"; exit 1
	fi
	if ! docker info >/dev/null 2>&1; then
		log ERROR "Docker daemon is not running"; exit 1
	fi
	if command -v docker-compose >/dev/null 2>&1; then
		COMPOSE_CMD="docker-compose"
	elif docker compose version >/dev/null 2>&1; then
		COMPOSE_CMD="docker compose"
	else
		log ERROR "Docker Compose is not available"; exit 1
	fi
	log INFO "Prerequisites OK"
}

create_env_file() {
	log INFO "Creating .env for FREDDY..."
	local tz ip puid pgid pihole_pw
	tz="${TZ:-America/Toronto}"
	ip=$(hostname -I 2>/dev/null | awk '{print $1}')
	ip=${ip:-192.168.1.100}
	puid=$(id -u)
	pgid=$(id -g)
	# Generate a random Pi-hole web password
	if command -v openssl >/dev/null 2>&1; then
		pihole_pw="pihole_$(openssl rand -hex 8)"
	else
		pihole_pw="pihole_change_me"
	fi

	cat > "$ENV_FILE" <<EOF
# FREDDY environment
TZ=$tz

# Pi-hole settings
PIHOLE_PASSWORD=$pihole_pw
PIHOLE_SERVER_IP=$ip
PIHOLE_DNS=1.1.1.1;8.8.8.8
PIHOLE_THEME=default-dark
PIHOLE_VIRTUAL_HOST=pihole.local

# UID/GID for linuxserver images
PUID=$puid
PGID=$pgid

# Watchtower
WATCHTOWER_SCHEDULE=0 2 * * *
EOF
	log INFO ".env created at $ENV_FILE"
}

show_environment_info() {
	echo "Detected environment: $DETECTED_ENV"
	echo "Compose: ${COMPOSE_CMD:-not detected}"
	echo "System: hostname=$(hostname) user=$USER"
	if command -v free >/dev/null 2>&1; then
		echo "Memory: $(free -m | awk '/^Mem:/{print $2}') MB"
	fi
}

docker_network_sanity() {
	log INFO "Checking Docker networking..."
	if ! docker network ls >/dev/null 2>&1; then
		log ERROR "Docker not accessible"; exit 1
	fi
	local testnet="freddy-net-check-$$"
	if docker network create "$testnet" >/dev/null 2>&1; then
		docker network rm "$testnet" >/dev/null 2>&1 || true
		log INFO "Docker networking OK"
	else
		log WARN "Docker networking check failed; continuing"
	fi
}

pull_images() {
	log INFO "Pulling images..."
	$COMPOSE_CMD -f docker-compose.yml pull --ignore-pull-failures || true
}

start_stack() {
	log INFO "Starting FREDDY services..."
	$COMPOSE_CMD -f docker-compose.yml up -d
	log INFO "Waiting for services to initialize..."
	sleep 10
	$COMPOSE_CMD -f docker-compose.yml ps
}

stop_stack() {
	log INFO "Stopping FREDDY services..."
	$COMPOSE_CMD -f docker-compose.yml down --remove-orphans
}

health_checks() {
	log INFO "Running quick health checks..."
	# Pi-hole admin
	if curl -fsS http://localhost:8080/admin/ >/dev/null 2>&1; then
		log INFO "Pi-hole UI: http://localhost:8080/admin"
	else
		log WARN "Pi-hole UI not reachable yet"
	fi
	# Home Assistant (host network)
	if curl -fsS http://localhost:8123/ >/dev/null 2>&1; then
		log INFO "Home Assistant: http://localhost:8123"
	else
		log WARN "Home Assistant not reachable yet"
	fi
	# Syncthing
	if curl -fsS http://localhost:8384/ >/dev/null 2>&1; then
		log INFO "Syncthing: http://localhost:8384"
	else
		log WARN "Syncthing not reachable yet"
	fi
	# Portainer
	if curl -fsS http://localhost:9000/api/status >/dev/null 2>&1; then
		log INFO "Portainer: http://localhost:9000"
	else
		log WARN "Portainer not reachable yet"
	fi
}

usage() {
	cat <<USAGE
FREDDY startup script

Usage: $(basename "$0") [options]
	--show-env        Print environment info and exit
	--stop            Stop and remove services
	--status          Show compose status
	--logs            Tail logs (Ctrl+C to exit)
	--no-pull         Do not pull images before start
	-h, --help        Show this help
USAGE
}

main() {
	local do_pull=1 action=start
	while [[ $# -gt 0 ]]; do
		case "$1" in
			--show-env) action=showenv; shift ;;
			--stop)     action=stop; shift ;;
			--status)   action=status; shift ;;
			--logs)     action=logs; shift ;;
			--no-pull)  do_pull=0; shift ;;
			-h|--help)  usage; exit 0 ;;
			*) log WARN "Unknown arg: $1"; usage; exit 1 ;;
		esac
	done

	check_prerequisites
	case "$action" in
		showenv)
			show_environment_info; exit 0 ;;
		stop)
			stop_stack; exit 0 ;;
		status)
			$COMPOSE_CMD -f docker-compose.yml ps; exit 0 ;;
		logs)
			$COMPOSE_CMD -f docker-compose.yml logs -f; exit 0 ;;
	esac

	cd "$PROJECT_ROOT"
	[[ -f "$ENV_FILE" ]] || create_env_file

	# Clean and sanity check
	$COMPOSE_CMD -f docker-compose.yml down --remove-orphans >/dev/null 2>&1 || true
	docker_network_sanity

	(( do_pull )) && pull_images
	start_stack
	health_checks

	log INFO "Done. Common endpoints:"
	echo "  Pi-hole:        http://localhost:8080/admin"
	echo "  Home Assistant: http://localhost:8123"
	echo "  Syncthing:      http://localhost:8384"
	echo "  Portainer:      http://localhost:9000"
}

main "$@"

