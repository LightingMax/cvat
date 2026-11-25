"""Exercise the sandbox against a disposable local fixture, using real Chrome."""

import argparse
import json
import re
import secrets
import time
from pathlib import Path

import requests
from playwright.sync_api import expect, sync_playwright

GATEWAY = "http://127.0.0.1:8081"


def result(response):
    if not response.ok:
        raise RuntimeError(f"{response.request.method} {response.url}: HTTP {response.status_code}")
    return response.json()


def wait_for_ui(deadline_seconds=240):
    deadline = time.monotonic() + deadline_seconds
    while time.monotonic() < deadline:
        try:
            if requests.get(GATEWAY, timeout=2).ok:
                health = requests.get(f"{GATEWAY}/api/server/about", timeout=2)
                if health.ok and health.json().get("version") == "2.83.0":
                    return
        except requests.RequestException:
            pass
        time.sleep(2)
    raise RuntimeError("The 8081 sandbox UI did not start")


def prepare_job(api, base, video):
    username = f"phase_demo_{secrets.token_hex(4)}"
    password = secrets.token_urlsafe(24)
    auth = result(
        api.post(
            f"{base}/api/auth/register",
            json={
                "username": username,
                "email": f"{username}@example.com",
                "password1": password,
                "password2": password,
            },
        )
    )
    api.headers["Authorization"] = f"Token {auth['key']}"
    labels = [
        {"name": "p_placement", "color": "#137b80", "type": "interval", "attributes": []},
        {"name": "p_transfer", "color": "#3761b1", "type": "interval", "attributes": []},
        {"name": "p_release", "color": "#8b4b97", "type": "interval", "attributes": []},
    ]
    labels.extend(
        {"name": f"extra_{index}", "color": "#3b6276", "type": "interval", "attributes": []}
        for index in range(4, 10)
    )
    labels.extend(
        [
            {"name": "instrument", "color": "#e65a22", "type": "rectangle", "attributes": []},
            {"name": "extra_10", "color": "#52994a", "type": "tag", "attributes": []},
            {"name": "reviewed", "color": "#4c694a", "type": "tag", "attributes": []},
        ]
    )
    task = result(
        api.post(
            f"{base}/api/tasks", json={"name": "Action phases | synthetic video", "labels": labels}
        )
    )
    with video.open("rb") as movie:
        request = result(
            api.post(
                f'{base}/api/tasks/{task["id"]}/data',
                data={"image_quality": 70},
                files={"client_files[0]": (video.name, movie, "video/mp4")},
            )
        )
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        request_state = result(api.get(f'{base}/api/requests/{request["rq_id"]}'))
        if request_state["status"] == "finished":
            jobs = result(api.get(f"{base}/api/jobs", params={"task_id": task["id"]}))
            job_id = jobs["results"][0]["id"]
            job_labels = result(
                api.get(f"{base}/api/labels", params={"job_id": job_id, "page_size": 100})
            )["results"]
            label_ids = {label["name"]: label["id"] for label in job_labels}
            result(
                api.patch(
                    f"{base}/api/jobs/{job_id}/annotations",
                    params={"action": "create"},
                    json={
                        "version": 0,
                        "tags": [
                            {
                                "label_id": label_ids["reviewed"],
                                "frame": 0,
                                "group": 0,
                                "source": "manual",
                                "attributes": [],
                            }
                        ],
                        "shapes": [
                            {
                                "type": "rectangle",
                                "label_id": label_ids["instrument"],
                                "frame": 0,
                                "group": 0,
                                "z_order": 0,
                                "source": "manual",
                                "occluded": False,
                                "outside": False,
                                "rotation": 0,
                                "attributes": [],
                                "points": [130, 90, 300, 240],
                            }
                        ],
                        "tracks": [],
                        "intervals": [],
                    },
                )
            )
            return username, password, task["id"], job_id
        if request_state["status"] == "failed":
            raise RuntimeError(f'Test upload failed: {request_state.get("message")}')
        time.sleep(1)
    raise RuntimeError("Test video import timed out")


def open_workflow(page):
    page.locator(".cvat-workspace-selector").click()
    page.locator(".cvat-workspace-selector-dropdown .ant-select-item-option-content").filter(
        has_text=re.compile(r"^Video understanding$"),
    ).click()
    expect(page.locator(".cvat-workspace-selector input")).not_to_be_focused()
    return page.get_by_role("region", name="Video understanding")


def seek(page, phases, frame):
    field = page.locator(".cvat-player-frame-selector input")
    field.fill(str(frame))
    field.press("Enter")
    field.evaluate("(element) => element.blur()")
    expect(phases.get_by_text(f"Frame {frame}", exact=True)).to_be_visible()


def displayed_frame(phases):
    return int(
        phases.locator(".cvat-action-phase-details > .ant-typography")
        .first.inner_text()
        .split()[-1]
    )


def wait_for_frame(page, frame):
    page.wait_for_function(
        """(minimum) => Number(document.querySelector(
               '.cvat-action-phase-details > .ant-typography').textContent.split(' ').at(-1)) >= minimum""",
        arg=frame,
    )


def save(page):
    with page.expect_response(
        lambda item: "/annotations" in item.url and item.request.method in {"PATCH", "PUT"}
    ) as pending:
        page.locator(".cvat-annotation-header-save-button").click()
    assert pending.value.ok
    expect(page.locator(".cvat-annotation-header-save-button")).to_have_text("Save")


def drag(page, target, x):
    area = target.bounding_box()
    assert area
    start = area["x"] + area["width"] / 2
    y = area["y"] + area["height"] / 2
    page.mouse.move(start, y)
    page.mouse.down()
    page.mouse.move(x, y, steps=5)
    page.mouse.up()


def clip(phases, title):
    return phases.locator(f'button.cvat-action-phase-segment[title="{title}"]')


def track(phases, label):
    return phases.locator(f'[aria-label="{label} track"]')


def at(bounds, frame):
    return bounds["x"] + bounds["width"] * (frame + 0.5) / 180


def record(page, phases, key, start, end):
    seek(page, phases, start)
    page.keyboard.press(key)
    seek(page, phases, end)
    page.keyboard.press(key)


def toggle_option(page, label, option):
    page.get_by_role("button", name="Recording settings", exact=True).click()
    control = page.get_by_role("combobox", name=label, exact=True)
    control.locator(
        "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' ant-select ')][1]"
    ).click()
    page.locator(".ant-select-dropdown:visible").get_by_text(option, exact=True).click()
    page.get_by_role("button", name="Playback", exact=True).click()


def browser_test(api, base, username, password, task_id, job_id, output):
    annotation_url = f"{base}/api/jobs/{job_id}/annotations"
    job_url = f"{GATEWAY}/tasks/{task_id}/jobs/{job_id}"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1440, "height": 960})
        page.set_default_timeout(10000)
        page.goto(f"{GATEWAY}/auth/login")
        page.locator("#credential").fill(username)
        page.locator("#password").fill(password)
        page.locator('.cvat-login-form button[type="submit"]').click()
        page.wait_for_url(lambda url: "/auth/login" not in url)
        page.goto(job_url)
        phases = open_workflow(page)
        playback = phases.get_by_role("button", name="Playback", exact=True)
        place = phases.get_by_role("button", name="p_placement action track", exact=True)
        transfer = phases.get_by_role("button", name="p_transfer action track", exact=True)
        shape = page.locator("rect[id^='cvat_canvas_shape_']")
        layer_stack = page.get_by_role("button", name="Open layer stack")
        overlay_settings = phases.get_by_role("button", name="Canvas annotations", exact=True)
        expect(shape).to_be_visible()
        expect(layer_stack).to_have_count(0)
        overlay_settings.click()
        page.get_by_role("checkbox", name="Objects", exact=True).uncheck()
        expect(shape).to_have_count(0)
        tags_option = page.get_by_role("checkbox", name="Frame tags", exact=True)
        tags_option.check()
        frame_tag = page.locator(".cvat-canvas-frame-tags").get_by_text("reviewed", exact=True)
        expect(frame_tag).to_be_visible()
        tags_option.uncheck()
        expect(frame_tag).to_have_count(0)
        overlay_settings.click()
        page.locator(".cvat-workspace-selector").click()
        page.locator(".cvat-workspace-selector-dropdown .ant-select-item-option-content").filter(
            has_text=re.compile(r"^Standard$"),
        ).click()
        expect(shape).to_be_visible()
        expect(layer_stack).to_be_visible()
        phases = open_workflow(page)
        expect(shape).to_have_count(0)
        expect(layer_stack).to_have_count(0)
        overlay_settings.click()
        page.get_by_role("checkbox", name="Objects", exact=True).check()
        expect(shape).to_be_visible()
        overlay_settings.click()
        playback.click()
        expect(playback).to_have_attribute("aria-pressed", "true")
        page.keyboard.press("m")
        expect(phases.locator('[data-recording="true"]')).to_have_count(0)
        expect(phases.get_by_text("Step [C]", exact=False)).to_have_count(0)
        for key, target in (
            ("Tab", place),
            ("Tab", transfer),
            ("Shift+Tab", place),
            ("Shift+Tab", playback),
            ("Shift+Tab", phases.get_by_role("button", name="extra_9 action track", exact=True)),
            ("Tab", playback),
            ("Tab", place),
        ):
            page.keyboard.press(key)
            expect(target).to_have_attribute("aria-pressed", "true")
            expect(target).to_be_focused()
        expect(phases.get_by_text("Frame 0", exact=True)).to_be_visible()
        expect(phases.locator('[data-recording="true"]')).to_have_count(0)
        expect(phases.locator('.cvat-action-phase-track[data-active="true"]')).to_have_css(
            "outline-style", "solid"
        )
        expect(track(phases, "p_placement")).to_have_css("background-color", "rgb(241, 241, 241)")
        expect(track(phases, "p_transfer")).to_have_css("background-color", "rgb(241, 241, 241)")
        page.keyboard.press("Escape")
        expect(phases.get_by_role("button", name="Recording settings", exact=True)).to_be_focused()
        page.keyboard.press("Tab")
        expect(place).to_have_attribute("aria-pressed", "true")
        playback.click()
        page.keyboard.press("Space")
        expect(page.locator(".cvat-player-pause-button")).to_be_visible()
        page.keyboard.press("Tab")
        expect(place).to_have_attribute("aria-pressed", "true")
        expect(page.locator(".cvat-player-pause-button")).to_be_visible()
        page.keyboard.press("1")
        page.keyboard.press("Numpad2")
        expect(transfer).to_have_attribute("aria-pressed", "true")
        expect(phases.locator('[data-recording="true"]')).to_have_count(2)
        expect(page.locator(".cvat-player-pause-button")).to_be_visible()
        page.keyboard.press("r")
        expect(playback).to_have_attribute("aria-pressed", "true")
        expect(phases.locator('[data-recording="true"]')).to_have_count(2)
        page.keyboard.press("Space")
        expect(page.locator(".cvat-player-play-button")).to_be_visible()
        for row in (place, transfer):
            row.click()
            phases.get_by_role("button", name="Discard recording", exact=True).click()
        expect(phases.locator('[data-recording="true"]')).to_have_count(0)

        seek(page, phases, 30)
        for key, frame in [("f", 31), ("d", 30), ("v", 40), ("c", 30)]:
            page.keyboard.press(key)
            expect(phases.get_by_text(f"Frame {frame}", exact=True)).to_be_visible()

        placement_track = track(phases, "p_placement")
        bounds = placement_track.bounding_box()
        assert bounds
        page.mouse.dblclick(at(bounds, 12), bounds["y"] + bounds["height"] / 2)
        handle = phases.get_by_role("button", name="Drag recording end of p_placement")
        expect(handle).to_be_visible()
        expect(handle.locator("..")).to_have_css("background-color", "rgba(19, 123, 128, 0.282)")
        drag(page, handle, at(bounds, 32))
        expect(phases.get_by_text("Frame 32", exact=True)).to_be_visible()
        handle.dblclick()
        expect(clip(phases, "p_placement · 12–32")).to_be_visible()

        phases.get_by_role("button", name="Add action track", exact=True).click()
        add_track = page.get_by_role("dialog", name="Add action track", exact=True)
        expect(add_track).to_be_visible()
        add_track.get_by_role("textbox", name="Name").fill("extra_10")
        expect(
            add_track.get_by_role("textbox", name="Recording shortcut", exact=True)
        ).to_have_value("0")
        add_track.locator(".ant-color-picker-trigger").click()
        page.locator(".ant-color-picker-hex-input input").fill("8354a2")
        add_track.locator("input").first.click()
        add_track.get_by_role("button", name="Add track", exact=True).click()
        expect(add_track).not_to_be_visible()
        new_track = phases.get_by_role("button", name="extra_10 action track", exact=True)
        expect(new_track).to_have_attribute("aria-pressed", "true")
        expect(clip(phases, "p_placement · 12–32")).to_be_visible()
        saved_labels = result(
            api.get(f"{base}/api/labels", params={"job_id": job_id, "page_size": 100})
        )["results"]
        assert any(
            x["name"] == "extra_10 [interval]"
            and x["color"].lower() == "#8354a2"
            and x["type"] == "interval"
            for x in saved_labels
        )
        seek(page, phases, 74)
        page.keyboard.press("Numpad0")
        expect(phases.get_by_role("button", name="Draft extra_10", exact=True)).to_be_visible()
        seek(page, phases, 78)
        page.keyboard.press("0")
        expect(clip(phases, "extra_10 · 74–78")).to_be_visible()

        change_key = phases.get_by_role("button", name="Change extra_10 shortcut", exact=True)
        change_key.click()
        edit_key = page.get_by_role("dialog", name="Shortcut for extra_10", exact=True)
        key_input = edit_key.get_by_role("textbox", name="Recording shortcut", exact=True)
        key_input.focus()
        page.keyboard.press("f")
        edit_key.get_by_role("button", name="Save", exact=True).click()
        expect(edit_key.get_by_role("alert")).to_contain_text("Next frame")
        key_input.focus()
        page.keyboard.press("y")
        edit_key.get_by_role("button", name="Save", exact=True).click()
        expect(edit_key).not_to_be_visible()
        expect(change_key).to_have_text("Y")
        record(page, phases, "y", 82, 85)
        expect(clip(phases, "extra_10 · 82–85")).to_be_visible()

        page.keyboard.press("F2")
        settings = page.get_by_role("dialog", name="Settings", exact=True)
        settings.get_by_role("tab", name="Shortcuts").click()
        settings.get_by_placeholder("Search for a shortcut here...").fill("Action track 10")
        shortcut_row = settings.locator(".cvat-shortcuts-settings-collapse-item").filter(
            has_text="Action track 10"
        )
        expect(settings.get_by_text("Video understanding", exact=True)).to_be_visible()
        expect(shortcut_row.locator(".ant-select-selection-item")).to_have_text("y")
        shortcut_row.locator("input").focus()
        page.keyboard.press("u")
        expect(shortcut_row.locator(".ant-select-selection-item")).to_have_count(2)
        settings.get_by_role("button", name="Close", exact=True).last.click()
        expect(settings).not_to_be_visible()
        record(page, phases, "u", 88, 93)
        expect(clip(phases, "extra_10 · 88–93")).to_be_visible()

        record(page, phases, "Numpad2", 20, 45)
        expect(clip(phases, "p_transfer · 20–45")).to_be_visible()
        record(page, phases, "Numpad2", 60, 70)
        expect(clip(phases, "p_transfer · 60–70")).to_be_visible()
        record(page, phases, "Numpad2", 40, 64)
        merged = clip(phases, "p_transfer · 20–70")
        expect(merged).to_be_visible()
        expect(
            track(phases, "p_transfer").locator("button.cvat-action-phase-segment")
        ).to_have_count(1)
        record(page, phases, "2", 100, 109)
        expect(
            track(phases, "p_transfer").locator("button.cvat-action-phase-segment")
        ).to_have_count(2)

        area = merged.bounding_box()
        assert area
        left = {"x": area["width"] * 0.2, "y": 8}
        right = {"x": area["width"] * 0.8, "y": 8}
        merged.click(position=left)
        page.keyboard.press("NumpadAdd")
        expect(clip(phases, "p_transfer · 19–70")).to_be_visible()
        page.keyboard.press("NumpadSubtract")
        expect(merged).to_be_visible()
        page.keyboard.press("Shift+Equal")
        expect(clip(phases, "p_transfer · 19–70")).to_be_visible()
        page.keyboard.press("Minus")
        expect(merged).to_be_visible()
        page.keyboard.press("Equal")
        expect(clip(phases, "p_transfer · 19–70")).to_be_visible()
        page.keyboard.press("Minus")
        expect(merged).to_be_visible()

        start_handle = phases.get_by_role("button", name="Drag start of p_transfer", exact=True)
        end_handle = phases.get_by_role("button", name="Drag end of p_transfer", exact=True)
        merged.hover(position=left)
        expect(start_handle).to_have_attribute("data-edge-target", "true")
        expect(end_handle).to_have_attribute("data-edge-target", "false")
        left_style = start_handle.evaluate(
            "(el) => [getComputedStyle(el, '::before').height, getComputedStyle(el, '::before').backgroundColor]"
        )
        right_style = end_handle.evaluate(
            "(el) => [getComputedStyle(el, '::before').height, getComputedStyle(el, '::before').backgroundColor]"
        )
        assert (
            left_style[0] == "18px" and right_style[0] == "10px" and left_style[1] == right_style[1]
        )
        merged.hover(position=right)
        expect(start_handle).to_have_attribute("data-edge-target", "false")
        expect(end_handle).to_have_attribute("data-edge-target", "true")
        page.keyboard.press("NumpadAdd")
        expect(clip(phases, "p_transfer · 20–71")).to_be_visible()
        page.keyboard.press("NumpadSubtract")
        expect(merged).to_be_visible()
        page.keyboard.press("Shift+Equal")
        expect(clip(phases, "p_transfer · 20–71")).to_be_visible()
        page.keyboard.press("Minus")
        expect(merged).to_be_visible()

        release = track(phases, "p_release")
        phases.get_by_role("button", name="Hide p_release track").click()
        expect(release).to_have_count(0)
        transfer.click()
        page.keyboard.press("Tab")
        expect(phases.get_by_role("button", name="extra_4 action track")).to_have_attribute(
            "aria-pressed", "true"
        )
        expect(release).to_have_count(0)
        phases.get_by_role("button", name="Show hidden tracks").click()
        expect(release).to_be_visible()
        transfer.click()
        page.keyboard.press("Tab")
        expect(phases.get_by_role("button", name="p_release action track")).to_have_attribute(
            "aria-pressed", "true"
        )
        phases.get_by_role("button", name="Collapse hidden tracks").click()
        expect(release).to_have_count(0)

        toggle_option(page, "Recording mode", "Hold to record")
        seek(page, phases, 25)
        page.keyboard.down("Numpad3")
        expect(release).to_be_visible()
        seek(page, phases, 36)
        page.keyboard.up("Numpad3")
        expect(clip(phases, "p_release · 25–36")).to_be_visible()
        page.keyboard.press("r")
        expect(playback).to_have_attribute("aria-pressed", "true")
        expect(release).to_have_count(0)

        seek(page, phases, 120)
        place.click()
        page.keyboard.press("m")
        placement_draft = phases.get_by_role("button", name="Draft p_placement", exact=True)
        draft_box = placement_draft.locator("..")
        expect(draft_box).to_have_attribute("data-end-frame", "120")
        expect(page.locator(".cvat-player-play-button")).to_be_visible()
        page.keyboard.press("Space")
        wait_for_frame(page, 124)
        page.keyboard.press("Space")
        expect(page.locator(".cvat-player-play-button")).to_be_visible()
        expect(draft_box).to_have_attribute("data-pending-end", "true")
        first_pause = int(draft_box.get_attribute("data-end-frame"))
        seek(page, phases, 179)
        page.keyboard.press("f")
        expect(draft_box).to_have_attribute("data-end-frame", str(first_pause))
        expect(draft_box).to_have_attribute("data-pending-end", "true")
        seek(page, phases, first_pause + 5)
        expect(draft_box).to_have_attribute("data-end-frame", str(first_pause))
        page.keyboard.press("d")
        expect(phases.get_by_text(f"Frame {first_pause + 4}", exact=True)).to_be_visible()
        expect(draft_box).to_have_attribute("data-end-frame", str(first_pause))
        page.keyboard.press("f")
        expect(draft_box).to_have_attribute("data-pending-end", "false")
        expect(draft_box).to_have_attribute("data-end-frame", str(first_pause + 5))
        page.keyboard.press("f")
        expect(draft_box).to_have_attribute("data-end-frame", str(first_pause + 6))
        page.keyboard.press("Space")
        expect(draft_box).to_have_attribute("data-pending-end", "false")
        wait_for_frame(page, first_pause + 8)
        page.keyboard.press("Space")
        expect(draft_box).to_have_attribute("data-pending-end", "true")
        confirmed_end = int(draft_box.get_attribute("data-end-frame"))
        inspected_frame = confirmed_end + 6
        seek(page, phases, inspected_frame)
        placement_draft.click()
        expect(draft_box).to_have_attribute("data-end-frame", str(confirmed_end))
        expect(phases.get_by_text(f"Frame {inspected_frame}", exact=True)).to_be_visible()
        placement_draft.dblclick()
        expect(clip(phases, f"p_placement · 120–{confirmed_end}")).to_be_visible()
        expect(phases.get_by_text(f"Frame {inspected_frame}", exact=True)).to_be_visible()

        seek(page, phases, 151)
        transfer.click()
        page.keyboard.press("m")
        expect(phases.get_by_role("button", name="Draft p_transfer", exact=True)).to_be_visible()
        page.keyboard.press("f")
        expect(phases.get_by_text("Frame 152", exact=True)).to_be_visible()
        page.keyboard.press("m")
        expect(clip(phases, "p_transfer · 151–152")).to_be_visible()

        seek(page, phases, 159)
        transfer.click()
        page.keyboard.down("Shift")
        page.keyboard.down("m")
        expect(page.locator(".cvat-player-pause-button")).to_be_visible()
        wait_for_frame(page, 163)
        page.keyboard.up("Shift")
        page.keyboard.press("r")
        expect(playback).to_have_attribute("aria-pressed", "true")
        page.keyboard.up("m")
        expect(page.locator(".cvat-player-play-button")).to_be_visible()
        last_end = displayed_frame(phases)
        expect(clip(phases, f"p_transfer · 159–{last_end}")).to_be_visible()
        expect(playback).to_have_attribute("aria-pressed", "true")

        save(page)
        saved = result(api.get(annotation_url))
        assert sorted((item["start"], item["stop"]) for item in saved["intervals"]) == [
            (12, 33),
            (20, 71),
            (25, 37),
            (74, 79),
            (82, 86),
            (88, 94),
            (100, 110),
            (120, confirmed_end + 1),
            (151, 153),
            (159, last_end + 1),
        ]
        assert len(saved["tags"]) == 1 and saved["tags"][0]["frame"] == 0
        assert len(saved["shapes"]) == 1 and saved["shapes"][0]["points"] == [130, 90, 300, 240]
        page.reload()
        phases = open_workflow(page)
        expect(clip(phases, "p_transfer · 20–70")).to_be_visible()
        expect(clip(phases, "p_transfer · 100–109")).to_be_visible()
        expect(clip(phases, "extra_10 · 88–93")).to_be_visible()
        expect(
            phases.get_by_role("button", name="Change extra_10 shortcut", exact=True)
        ).to_have_text("Y, U")
        expect(track(phases, "p_release")).to_have_count(0)
        phases.get_by_role("button", name="Show hidden tracks").click()
        expect(clip(phases, "p_release · 25–36")).to_be_visible()
        phases.get_by_role("button", name="Show p_release track").click()

        with page.expect_download() as pending:
            phases.get_by_role("button", name="Export JSON").click()
        pending.value.save_as(output / "job-action-phases.json")
        exported = json.loads((output / "job-action-phases.json").read_text())
        assert sorted(
            (item["label"], item["start_frame"], item["end_frame"])
            for item in exported["intervals"]
        ) == [
            ("extra_10", 74, 78),
            ("extra_10", 82, 85),
            ("extra_10", 88, 93),
            ("p_placement", 12, 32),
            ("p_placement", 120, confirmed_end),
            ("p_release", 25, 36),
            ("p_transfer", 20, 70),
            ("p_transfer", 100, 109),
            ("p_transfer", 151, 152),
            ("p_transfer", 159, last_end),
        ]
        notification_close = page.locator(
            ".cvat-notification-continue-job .ant-notification-notice-close"
        )
        if notification_close.is_visible():
            notification_close.click()
        clip(phases, "p_transfer · 20–70").click()
        expect(phases.get_by_text("Frame 20", exact=True)).to_be_visible()
        page.screenshot(path=output / "video-understanding.png")
        phases.screenshot(path=output / "active-track.png")
        merged = clip(phases, "p_transfer · 20–70")
        geometry = merged.bounding_box()
        assert geometry
        merged.hover(position={"x": geometry["width"] * 0.2, "y": 8})
        phases.screenshot(path=output / "clip-edge-hover.png")

        def choose_delete():
            phases.get_by_role("button", name="Options for extra_10", exact=True).click()
            page.get_by_role("menuitem", name="Delete track").click()
            confirmation = page.locator(".ant-modal-confirm").filter(
                has_text='Delete action track "extra_10"?'
            )
            expect(confirmation).to_contain_text("all of its intervals across this task")
            return confirmation

        confirmation = choose_delete()
        confirmation.get_by_role("button", name="Cancel", exact=True).click()
        expect(confirmation).not_to_be_visible()
        expect(clip(phases, "extra_10 · 88–93")).to_be_visible()

        placement = clip(phases, "p_placement · 12–32")
        placement.click()
        area = placement.bounding_box()
        assert area
        placement.hover(position={"x": area["width"] * 0.8, "y": 8})
        page.keyboard.press("NumpadAdd")
        expect(clip(phases, "p_placement · 12–33")).to_be_visible()
        expect(phases.get_by_text("Frame 33", exact=True)).to_be_visible()

        confirmation = choose_delete()
        confirmation.screenshot(path=output / "delete-track-confirmation.png")
        with page.expect_response(
            lambda item: "/labels/" in item.url and item.request.method == "DELETE"
        ) as removed:
            confirmation.get_by_role("button", name="Save and delete", exact=True).click()
        assert removed.value.status == 204
        expect(confirmation).not_to_be_visible()
        expect(phases.get_by_text("Frame 33", exact=True)).to_be_visible()
        expect(track(phases, "extra_10")).to_have_count(0)
        expect(clip(phases, "p_placement · 12–33")).to_be_visible()
        updated_labels = result(
            api.get(f"{base}/api/labels", params={"job_id": job_id, "page_size": 100})
        )["results"]
        assert "extra_10 [interval]" not in {item["name"] for item in updated_labels}
        assert any(item["name"] == "extra_10" and item["type"] == "tag" for item in updated_labels)
        deleted_label_id = next(
            item["id"] for item in saved_labels if item["name"] == "extra_10 [interval]"
        )
        remaining = result(api.get(annotation_url))
        assert all(item["label_id"] != deleted_label_id for item in remaining["intervals"])
        assert (12, 34) in {(item["start"], item["stop"]) for item in remaining["intervals"]}
        assert remaining["shapes"] == saved["shapes"] and remaining["tags"] == saved["tags"]

        print(
            f"PASS: delete-track cancel/save/delete, inline track creation, 0/custom keys, global Settings, border-only selection, left/right edge keys and cues, canvas overlays, Tab, "
            f"pause/F continuation and confirmation, full-track highlight, M toggle, Shift+M hold, save/reload, export ({job_url})"
        )
        browser.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    wait_for_ui()
    with requests.Session() as api:
        username, password, task, job = prepare_job(api, GATEWAY, args.video)
        print(f"Prepared synthetic task {task}, job {job}", flush=True)
        browser_test(api, GATEWAY, username, password, task, job, args.output)


if __name__ == "__main__":
    main()
