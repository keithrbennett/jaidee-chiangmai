import zipfile,re,os,html
def read(path, sheet):
    z=zipfile.ZipFile(path)
    ss=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        x=z.read('xl/sharedStrings.xml').decode()
        for si in re.findall(r'<si>(.*?)</si>',x,re.S):
            ss.append(html.unescape(''.join(re.findall(r'<t[^>]*>(.*?)</t>',si,re.S))))
    x=z.read(f'xl/worksheets/sheet{sheet}.xml').decode()
    rows=[]
    for r in re.findall(r'<row[^>]*>(.*?)</row>',x,re.S):
        row={}
        for c in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*?)(?:/>|>(.*?)</c>)',r,re.S):
            col,attrs,inner=c.groups(); inner=inner or ''
            v=re.search(r'<v>(.*?)</v>',inner,re.S); t=re.search(r'<is>.*?<t[^>]*>(.*?)</t>',inner,re.S)
            if 't="s"' in attrs and v: val=ss[int(v.group(1))]
            elif t: val=html.unescape(t.group(1))
            elif v: val=html.unescape(v.group(1))
            else: val=''
            row[col]=val
        rows.append(row)
    hdr=rows[0]; cols=sorted(hdr,key=lambda c:(len(c),c))
    return [{hdr[c]:r.get(c,'') for c in cols} for r in rows[1:]]
