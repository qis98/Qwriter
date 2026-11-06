"""Build the pinned, publicly available upstream gateway. No user data needed."""
import argparse,os,shutil,subprocess
from pathlib import Path

REPOSITORY='https://github.com/XCool-603/wrokbuddy2api.git'
COMMIT='aa113b50b3d4dc45597d5d736d88a88a2443a92b'

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--go',default='go');args=parser.parse_args()
    root=Path(__file__).resolve().parents[1];source=root/'build'/'gateway-source';output=root/'build'/'gateway'
    go=shutil.which(args.go) or args.go
    if Path(go).is_file():go=str(Path(go).resolve())
    source.mkdir(parents=True,exist_ok=True);output.mkdir(parents=True,exist_ok=True)
    def git(*arguments):return subprocess.run(['git','-C',str(source),*arguments],check=True,text=True,encoding='utf-8',errors='replace',capture_output=True).stdout.strip()
    if not (source/'.git').exists():
        if any(source.iterdir()):raise SystemExit('build/gateway-source must be empty or the pinned upstream checkout.')
        git('init')
    if 'origin' not in git('remote').splitlines():git('remote','add','origin',REPOSITORY)
    if git('remote','get-url','origin')!=REPOSITORY:raise SystemExit('Unexpected gateway source remote; refusing to overwrite it.')
    if git('status','--porcelain'):raise SystemExit('Gateway source has local changes; preserve them before building.')
    git('fetch','--depth','1','origin',COMMIT);git('checkout','--detach','FETCH_HEAD')
    if git('rev-parse','HEAD')!=COMMIT:raise SystemExit('Upstream commit verification failed.')
    env={**os.environ,'GOOS':'windows','GOARCH':'amd64','CGO_ENABLED':'0'}
    subprocess.run([go,'build','-mod=readonly','-trimpath','-ldflags','-H windowsgui -s -w','-o','../gateway/workbuddy2api.exe','./cmd/server'],cwd=source,env=env,check=True)
    if not (output/'workbuddy2api.exe').is_file():raise SystemExit('Go returned without an executable. Check build output and local security software.')
    shutil.copy2(source/'LICENSE',output/'LICENSE-workbuddy2api.txt')
    print('Pinned gateway built:',output/'workbuddy2api.exe')

if __name__=='__main__':main()
