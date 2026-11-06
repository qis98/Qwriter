# 从源码构建

普通用户请直接[下载安装包](https://github.com/qis98/Qwriter/releases/latest)。源码公开不授予通用开源或商业改造许可，请先阅读[LICENSE](../LICENSE)。

## 开发环境

- Windows x64、PowerShell 7、Git。
- Node.js 24（开发验证所用系列）。
- Python 3.14（1.0.0构建验证版本），依赖见 `requirements-dev.txt`。
- Go：需满足固定上游提交的 `go.mod` 及依赖要求，用于编译网关。

## 构建步骤

```powershell
git clone https://github.com/qis98/Qwriter.git
cd Qwriter
npm ci
python -m pip install -r requirements-dev.txt
python scripts/prepare_gateway.py
python scripts/build_worker.py
npm start
```

`prepare_gateway.py` 从公开上游获取并校验固定提交 `aa113b50b3d4dc45597d5d736d88a88a2443a92b`，源码放在 `build/gateway-source`，编译产物放在 `build/gateway`。不需要作者本机的 `poc/` 目录、账号或密钥。构建需能访问GitHub和Go模块服务，可按本机网络环境配置开发工具。

`build_worker.py` 构建Python执行器并将网关及许可文件放入 `runtime/`。这些构建产物不进入Git历史。

## 检查和打包

```powershell
npm test
python -m unittest discover -s worker -p "test_*.py"
$env:PYTHONPATH = "worker"
python -m unittest discover -s tests -p "test_*.py"
node scripts/verify_release.js node_modules/electron/dist/electron.exe
npm run dist
```

安装包输出到 `release/`。安装器支持自定义目录，并创建 `安装目录\Qwriter\workspace`。安装包由作者通过GitHub Releases单独发布，不将百兆级二进制提交到源码仓库。

`--smoke` 使用临时隔离数据与模拟接口，禁用真实模型请求、公众号修改、公开发表和群发。真实账号的能力和模型输出质量需要单独试用，不能由模拟测试证明。

## 主要目录

| 目录 | 用途 |
| --- | --- |
| `src/` | Electron主进程、IPC、桌面界面与本地数据管理 |
| `worker/` | 文章生成、排版、素材和公众号接口执行器 |
| `scripts/` | 网关准备、执行器构建、安装器及隔离验证 |
| `tests/` | Node与Python测试 |
| `third_party/` | 上游版权与许可文件 |

当前安装包未配置数字签名。本仓库的CI验证自动测试，不会读取或要求个人账号密钥。
