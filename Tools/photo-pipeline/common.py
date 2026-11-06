import re,glob,os,unicodedata,collections
from PIL import Image
D="/Users/ajsarmiento/Downloads/Team Photos/"
R="/Users/ajsarmiento/Documents/Claude/MineskiBR/photos/"
def fold(s):
    s=s.replace('Ǝ','E').replace('Ł','L').replace('ł','l').replace('Ʉ','U')
    s=unicodedata.normalize('NFKD',s)
    s=''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]','',s.lower().replace('3','e'))
def pose(fn):
    u=fn.upper()
    if 'SIGNATURE' in u: return 'SIG'
    if 'WIN' in u: return 'WIN'
    if re.search(r'POSE_?L\.PNG$|_L\.PNG$',u): return 'L'
    if re.search(r'POSE_?R\.PNG$|_R\.PNG$',u): return 'R'
    if re.search(r'_M\.PNG$',u): return 'M'
    return '?'
def inventory():
    inv=collections.defaultdict(list)
    for f in glob.glob(D+"**/*.png",recursive=True):
        p=f[len(D):].split('/')
        inv[(p[1],p[3])].append((pose(p[-1]),f))
    return inv
def oldteams():
    return {fold(t):t for t in os.listdir(R+'FRONT') if os.path.isdir(R+'FRONT/'+t)}
