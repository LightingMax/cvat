"""Write a read-only report for the CVAT Minus maintainers to standard output."""

import json
import os
from datetime import datetime, timedelta, timezone
from html import escape
from urllib.parse import urlencode
from urllib.request import Request, urlopen

UPSTREAM = "cvat-ai/cvat"
BASE = "v2.84.0"


def get(path):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "cvat-minus-upstream-report"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request("https://api.github.com/" + path, headers=headers)
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def main():
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=7)).date().isoformat()
    prefix = f"repos/{UPSTREAM}/"
    release = get(prefix + "releases/latest")
    latest = release["tag_name"]
    print(f"# CVAT Minus upstream report · {now:%Y-%m-%d} UTC\n")
    print(f"Minus base **{BASE}** · Latest stable [{latest}]({release['html_url']})")
    if BASE != latest:
        print(
            f"\n[Review the release delta](https://github.com/{UPSTREAM}/compare/{BASE}...{latest})"
        )
    print("\n## Upstream proposals\n")
    for number in (11492, 11493):
        pr = get(prefix + f"pulls/{number}")
        reviews = get(prefix + f"pulls/{number}/reviews?per_page=100")
        state = (
            "merged"
            if pr["merged_at"]
            else ("draft" if pr["draft"] and pr["state"] == "open" else pr["state"])
        )
        print(
            f"- [#{number}]({pr['html_url']}) {escape(pr['title'])} · {state} · "
            f"{pr['comments']} discussion comments · {pr['review_comments']} inline comments · "
            f"{len(reviews)} submitted reviews · updated {pr['updated_at']}"
        )
    issues = {}
    for term in (
        "interval",
        "timeline",
        "frame range",
        "annotation save",
        "draft",
        "keyframe",
        "conflict",
    ):
        query = f'repo:{UPSTREAM} is:issue updated:>={since} "{term}" in:title,body'
        data = get("search/issues?" + urlencode({"q": query, "sort": "updated", "per_page": 25}))
        issues.update({issue["number"]: issue for issue in data["items"]})
    tracked = get(prefix + "issues/4952")
    issues[tracked["number"]] = tracked
    print(
        f"\n## Related issues updated since {since}, plus the tracked video classification issue\n"
    )
    for issue in sorted(issues.values(), key=lambda item: item["updated_at"], reverse=True):
        print(
            f"- [#{issue['number']}]({issue['html_url']}) {escape(issue['title'])} · "
            f"{issue['state']} · updated {issue['updated_at']}"
        )


if __name__ == "__main__":
    main()
