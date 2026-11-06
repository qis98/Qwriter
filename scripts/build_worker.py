"""Build a standalone worker and stage the already verified local gateway."""
from pathlib import Path
import shutil
import subprocess
import sys
import hashlib
import importlib.metadata

root=Path(__file__).resolve().parents[1]
runtime=root/'runtime'; runtime.mkdir(exist_ok=True)
subprocess.run([sys.executable,'-m','PyInstaller','--noconfirm','--clean','--onefile','--name','article-worker',
               '--distpath',str(runtime),'--workpath',str(root/'build'/'worker'),
               '--specpath',str(root/'build'),'--add-data',str(root/'worker'/'humanizer-rules.md')+';.',str(root/'worker'/'worker.py')],cwd=root,check=True)
source=root/'build'/'gateway'/'workbuddy2api.exe'
target=runtime/'workbuddy2api.exe'
if source.exists() and (not target.exists() or hashlib.sha256(source.read_bytes()).digest()!=hashlib.sha256(target.read_bytes()).digest()):
    shutil.copy2(source,target)
if not target.exists():raise SystemExit('Missing gateway. Run python scripts/prepare_gateway.py first.')
for license_file in (root/'third_party').glob('LICENSE-*.txt'):
    shutil.copy2(license_file,runtime/license_file.name)
license_root=runtime/'licenses'; license_root.mkdir(exist_ok=True)
for name in ('LICENSE.txt','LICENSE'):
    p=Path(sys.base_prefix)/name
    if p.exists(): shutil.copy2(p,license_root/'Python-LICENSE.txt')
import PIL
for p in Path(PIL.__file__).parent.parent.glob('pillow-*.dist-info/licenses/LICENSE*'):
    shutil.copy2(p,license_root/'Pillow-LICENSE.txt')
for package in ('markdown-it-py','mdurl'):
    distribution=importlib.metadata.distribution(package)
    for entry in distribution.files or []:
        if 'LICENSE' in str(entry).upper() and not str(entry).endswith('.py'):
            shutil.copy2(distribution.locate_file(entry),license_root/(package+'-'+Path(str(entry)).name))
print('Runtime staged:',runtime)
