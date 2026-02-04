#!/bin/bash

# CLIProxyAPI 一键启动脚本
# 自动构建前端、启动后端，并处理端口占用问题

set -e

# 配置
BACKEND_PORT=${BACKEND_PORT:-8317}
FRONTEND_PORT=${FRONTEND_PORT:-5174}
CONFIG_FILE=${CONFIG_FILE:-"config.yaml"}
MODE=${1:-"prod"}  # prod 或 dev

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查并释放端口
kill_port() {
    local port=$1
    local pids=$(lsof -ti :$port 2>/dev/null || true)

    if [ -n "$pids" ]; then
        log_warn "端口 $port 被占用，正在终止进程..."
        for pid in $pids; do
            local process_name=$(ps -p $pid -o comm= 2>/dev/null || echo "unknown")
            log_info "终止进程: PID=$pid ($process_name)"
            kill -9 $pid 2>/dev/null || true
        done
        sleep 1
        log_success "端口 $port 已释放"
    fi
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."

    if ! command -v go &> /dev/null; then
        log_error "未找到 Go，请先安装 Go"
        exit 1
    fi

    if ! command -v node &> /dev/null; then
        log_error "未找到 Node.js，请先安装 Node.js"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        log_error "未找到 npm，请先安装 npm"
        exit 1
    fi

    log_success "依赖检查通过"
}

# 构建前端
build_frontend() {
    log_info "构建前端..."
    cd "$SCRIPT_DIR/web"

    # 检查是否需要安装依赖
    if [ ! -d "node_modules" ]; then
        log_info "安装前端依赖..."
        npm ci
    fi

    npm run build
    cd "$SCRIPT_DIR"
    log_success "前端构建完成"
}

# 检查配置文件
check_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        if [ -f "config.example.yaml" ]; then
            log_warn "未找到 $CONFIG_FILE，使用 config.example.yaml"
            CONFIG_FILE="config.example.yaml"
        else
            log_error "未找到配置文件"
            exit 1
        fi
    fi
}

# 生产模式：构建并运行
run_prod() {
    log_info "=== 生产模式启动 ==="

    check_dependencies
    check_config
    kill_port $BACKEND_PORT
    build_frontend

    log_info "启动后端服务..."
    log_info "后端地址: http://localhost:$BACKEND_PORT"
    log_info "管理页面: http://localhost:$BACKEND_PORT/management.html"
    echo ""

    go run ./cmd/server/ run --config "$CONFIG_FILE"
}

# 开发模式：前端热重载 + 后端
run_dev() {
    log_info "=== 开发模式启动 ==="

    check_dependencies
    check_config
    kill_port $BACKEND_PORT
    kill_port $FRONTEND_PORT

    # 确保前端至少构建过一次（后端需要 management.html）
    if [ ! -f "internal/managementasset/management.html" ]; then
        build_frontend
    fi

    log_info "启动前端开发服务器..."
    cd "$SCRIPT_DIR/web"
    FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT npm run dev &
    FRONTEND_PID=$!
    cd "$SCRIPT_DIR"

    # 等待前端启动
    sleep 2

    log_info "启动后端服务..."
    echo ""
    log_success "=== 服务已启动 ==="
    log_info "前端开发服务器: http://localhost:$FRONTEND_PORT"
    log_info "后端 API 服务器: http://localhost:$BACKEND_PORT"
    log_info "管理页面: http://localhost:$BACKEND_PORT/management.html"
    log_info "按 Ctrl+C 停止所有服务"
    echo ""

    # 捕获退出信号，清理子进程
    trap "log_info '正在停止服务...'; kill $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM

    go run ./cmd/server/ run --config "$CONFIG_FILE"
}

# 仅启动后端（假设前端已构建）
run_backend_only() {
    log_info "=== 仅启动后端 ==="

    check_config
    kill_port $BACKEND_PORT

    if [ ! -f "internal/managementasset/management.html" ]; then
        log_warn "未找到前端构建产物，先构建前端..."
        build_frontend
    fi

    log_info "启动后端服务..."
    log_info "后端地址: http://localhost:$BACKEND_PORT"
    log_info "管理页面: http://localhost:$BACKEND_PORT/management.html"
    echo ""

    go run ./cmd/server/ run --config "$CONFIG_FILE"
}

# 显示帮助
show_help() {
    echo "CLIProxyAPI 启动脚本"
    echo ""
    echo "用法: ./start.sh [模式]"
    echo ""
    echo "模式:"
    echo "  prod      生产模式 - 构建前端并启动后端 (默认)"
    echo "  dev       开发模式 - 前端热重载 + 后端"
    echo "  backend   仅启动后端"
    echo "  build     仅构建前端"
    echo "  help      显示此帮助信息"
    echo ""
    echo "环境变量:"
    echo "  BACKEND_PORT   后端端口 (默认: 8317)"
    echo "  FRONTEND_PORT  前端开发服务器端口 (默认: 5173)"
    echo "  CONFIG_FILE    配置文件路径 (默认: config.yaml)"
    echo ""
    echo "示例:"
    echo "  ./start.sh              # 生产模式启动"
    echo "  ./start.sh dev          # 开发模式启动"
    echo "  ./start.sh backend      # 仅启动后端"
    echo "  BACKEND_PORT=9000 ./start.sh  # 使用自定义端口"
}

# 主逻辑
case "$MODE" in
    "prod")
        run_prod
        ;;
    "dev")
        run_dev
        ;;
    "backend")
        run_backend_only
        ;;
    "build")
        check_dependencies
        build_frontend
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        log_error "未知模式: $MODE"
        show_help
        exit 1
        ;;
esac
