from pathlib import Path
import json
files=[Path('app.py'),Path('requirements.txt'),Path('vercel.json'),Path('data/products.json')]
files+=list(Path('backend/app').glob('*.py'))
files+=list(Path('frontend/src').glob('*.ts'))+list(Path('frontend/src').glob('*.tsx'))+list(Path('frontend/src').glob('*.css'))
files+=[Path('frontend')/n for n in ['package.json','tsconfig.json','vite.config.ts','index.html','pnpm-lock.yaml','pnpm-workspace.yaml']]
files+=list(Path('frontend/public').rglob('*.svg'))
print(json.dumps([{'file':p.as_posix(),'data':p.read_text(encoding='utf-8-sig')} for p in files if not p.name.endswith('.test.tsx') and p.name!='test-setup.ts']))
