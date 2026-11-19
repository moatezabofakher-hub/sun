#!/usr/bin/env python3
"""Remove old redundant Actions artifacts, never code, releases, logs or workflow runs."""
import datetime as dt
import json
import os
import urllib.request
from collections import defaultdict

repo=os.environ["GITHUB_REPOSITORY"]
token=os.environ["GH_TOKEN"]
api=os.environ.get("GITHUB_API_URL","https://api.github.com")
branch=os.environ.get("DEFAULT_BRANCH","main")
dry=os.environ.get("DRY_RUN","false").lower() in ("1","true","yes")
days=max(14,int(os.environ.get("MIN_AGE_DAYS","14")))
keep=max(3,int(os.environ.get("KEEP_SUCCESSFUL","3")))
limit=min(80,int(os.environ.get("MAX_DELETE","80")))

def req(path,method="GET"):
    r=urllib.request.Request(api+path,method=method,headers={
        "Authorization":"Bearer "+token,
        "Accept":"application/vnd.github+json",
        "X-GitHub-Api-Version":"2022-11-28",
        "User-Agent":"tiqany-safe-artifact-maintenance"})
    with urllib.request.urlopen(r,timeout=40) as response:
        body=response.read()
    return json.loads(body) if body else {}

def family(name):
    n=name.lower()
    if "project-source" in n: return "source:"+n
    for prefix,group in (
        ("tiqany-acc-main-","manager-apk"),
        ("tiqany-acc-agent-","employee-apk"),
        ("tiqany-acc-solo-","solo-apk"),
        ("tiqany-windows-","windows-installer"),
        ("tiqany-acc-windows-","windows-installer"),
        ("al-thamman-","al-thamman-build"),
    ):
        if n.startswith(prefix): return group
    return n

artifacts=[]
for page in range(1,101):
    j=req("/repos/"+repo+"/actions/artifacts?per_page=100&page="+str(page))
    if j.get("total_count",0)>10000: raise RuntimeError("Too many artifacts; cleanup stopped")
    artifacts.extend(j.get("artifacts",[]))
    if len(j.get("artifacts",[]))<100: break
else: raise RuntimeError("Pagination too large; cleanup stopped")
artifacts=sorted((a for a in artifacts if not a.get("expired")),
                 key=lambda a:(a.get("created_at",""),a["id"]),reverse=True)
runs={}
def run_of(a):
    rid=(a.get("workflow_run") or {}).get("id")
    if rid not in runs: runs[rid]=req("/repos/"+repo+"/actions/runs/"+str(rid))
    return runs[rid]

protected=defaultdict(set)
for a in artifacts:
    info=a.get("workflow_run") or {}
    key=family(a["name"])
    if not info.get("id") or info.get("head_branch")!=branch: continue
    if len(protected[key])>=keep: continue
    r=run_of(a)
    if r.get("status")=="completed" and r.get("conclusion")=="success" and r.get("head_branch")==branch:
        protected[key].add(info["id"])

cutoff=dt.datetime.now(dt.timezone.utc)-dt.timedelta(days=days)
removed=bytes_saved=candidates=0
summary=["## Safe Actions artifact cleanup",
         "Mode: "+("DRY RUN" if dry else "CLEANUP"),
         "Preserved: last "+str(keep)+" successful main-branch runs per artifact family.",
         "No repository files, tests, workflow logs, tags, or GitHub Releases are deleted.",""]
for a in artifacts:
    rid=(a.get("workflow_run") or {}).get("id")
    key=family(a["name"])
    created=dt.datetime.fromisoformat(a["created_at"].replace("Z","+00:00"))
    if not rid or created>=cutoff or not protected[key] or rid in protected[key]: continue
    r=run_of(a)
    if r.get("status")!="completed" or r.get("conclusion") not in ("success","failure","cancelled","skipped","timed_out"):
        continue
    candidates+=1
    if removed>=limit: continue
    if not dry: req("/repos/"+repo+"/actions/artifacts/"+str(a["id"]),"DELETE")
    removed+=1
    bytes_saved+=a.get("size_in_bytes",0)
    summary.append(("- Would delete " if dry else "- Deleted ")+a["name"]+" (artifact "+str(a["id"])+")")
summary.append("Eligible: "+str(candidates)+", "+("previewed" if dry else "deleted")+": "+
               str(removed)+", size: "+format(bytes_saved/1048576,".2f")+" MiB")
summary.append("At most "+str(limit)+" artifacts per run for safety.")
report="\n".join(summary)+"\n"
print(report)
if os.environ.get("GITHUB_STEP_SUMMARY"):
    with open(os.environ["GITHUB_STEP_SUMMARY"],"a",encoding="utf-8") as f: f.write(report)
