"""Exercise the release images in a disposable stack with registration enabled."""
import argparse
import re
import sys
from pathlib import Path
from uuid import uuid4

import requests
from playwright.sync_api import expect, sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "video-phases-sandbox"))
from smoke_test import open_workflow, prepare_job, result, seek


def check(base, video):
    with requests.Session() as api:
        username, password, task, job = prepare_job(api, base, video)
        url = f"{base}/api/jobs/{job}/annotations"
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(channel="chrome")
                page = browser.new_page(viewport={"width": 1440, "height": 960})
                page.goto(f"{base}/auth/login")
                page.locator("#credential").fill(username)
                page.locator("#password").fill(password)
                page.locator('.cvat-login-form button[type="submit"]').click()
                page.wait_for_url(lambda u: "/auth/login" not in u)
                page.goto(f"{base}/tasks/{task}/jobs/{job}")
                phases = open_workflow(page)
                phases.get_by_role("button", name="Add action track", exact=True).click()
                dialog = page.get_by_role("dialog", name="Add action track")
                dialog.get_by_role("textbox", name="Name").fill("reviewed")
                dialog.get_by_role("button", name="Add track", exact=True).click()
                expect(dialog).not_to_be_visible()
                phases.get_by_role("button", name="reviewed action track", exact=True).click()
                seek(page, phases, 2)
                page.keyboard.press("m")
                seek(page, phases, 7)
                page.keyboard.press("m")
                clip = phases.locator('button[title="reviewed · 2–7"]')
                expect(clip).to_be_attached()
                save = page.locator(".cvat-annotation-header-save-button")
                merge = re.compile(r"/annotations\?(?:[^#]*&)?action=merge(?:&|$)")
                page.route(merge, lambda route: route.abort())
                with page.expect_event("requestfailed", predicate=lambda r: "action=merge" in r.url):
                    save.click()
                assert not result(api.get(url))["intervals"]
                page.unroute(merge)
                page.reload()
                restored = page.locator(".ant-notification-notice").filter(has_text="Local annotation draft restored")
                expect(restored).to_be_visible(timeout=20000)
                with page.expect_response(lambda r: "action=merge" in r.url) as saved:
                    save.click()
                assert saved.value.ok, saved.value.status
                browser.close()
            data = result(api.get(url))
            labels = result(api.get(f"{base}/api/labels", params={"job_id": job, "page_size": 100}))["results"]
            ids = {(row["name"], row["type"]): row["id"] for row in labels}
            assert data["tags"][0]["label_id"] == ids["reviewed", "tag"]
            assert [(i["label_id"], i["start"], i["stop"]) for i in data["intervals"]] == [
                (ids["reviewed [interval]", "interval"], 2, 8)
            ]
            state = result(api.get(url, params={"include_revision": "true"}))
            edit = {"revision": state["revision"], "submission": str(uuid4()),
                    "create": {"tags": [{"label_id": ids["reviewed", "tag"], "frame": 12}]}}
            for _ in range(2):
                result(api.patch(url, params={"action": "merge"}, json=edit))
            assert len(result(api.get(url))["tags"]) == 2
            edit["submission"] = str(uuid4())
            assert api.patch(url, params={"action": "merge"}, json=edit).status_code == 409
            print("Passed interval creation, tag coexistence, draft recovery, retry and stale revision checks.")
        finally:
            api.delete(f"{base}/api/tasks/{task}").raise_for_status()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True)
    parser.add_argument("--video", type=Path, required=True)
    args = parser.parse_args()
    check(args.base.rstrip("/"), args.video)
