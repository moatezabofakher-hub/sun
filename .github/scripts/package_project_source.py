#!/usr/bin/env python3
"""ZIP tracked project sources and tests, excluding sensitive/local build files."""
import os
import pathlib
import subprocess
import sys
import zipfile

root=pathlib.Path(__file__).resolve().parents[2]
out=(root/sys.argv[1]).resolve()
assert out.is_relative_to(root), "Output path must be inside repository"
out.parent.mkdir(parents=True,exist_ok=True)
paths=subprocess.check_output(["git","ls-files","-z"],cwd=root).decode("utf-8","surrogateescape").split("\0")
ignore={".git",".gradle","node_modules","build","dist","output","project-downloads",".env",".venv","__pycache__"}
suffixes={".jks",".keystore",".p12",".pfx",".pem",".key",".db",".sqlite",".sqlite3"}
count=0
with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for name in paths:
        if not name: continue
        p=pathlib.Path(name)
        if any(part.lower() in ignore for part in p.parts): continue
        if p.name.lower().startswith((".env","id_rsa")): continue
        if p.name.lower() in ("credentials.json","service-account.json","google-services.json"): continue
        if p.suffix.lower() in suffixes: continue
        path=root/p
        if path.is_file() and not path.is_symlink():
            z.write(path,name)
            count+=1
    z.writestr("PROJECT-ARCHIVE-INFO.txt",
               "Repository: "+os.environ.get("GITHUB_REPOSITORY","")+"\n"+
               "Commit: "+os.environ.get("GITHUB_SHA","")+"\n"+
               "Contains tracked sources, tests and build workflows.\n"+
               "Signing keys and GitHub Secrets are excluded.\n")
assert count>=5 and out.stat().st_size>1000,"Incomplete source ZIP"
print("Packaged",count,"files in",out,":",out.stat().st_size,"bytes")
