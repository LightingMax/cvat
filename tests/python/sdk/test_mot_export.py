# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

import csv
import io
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

import av
import pytest
from cvat_sdk import Client, models
from PIL import Image, ImageDraw


def _box(frame: int, instrument: int) -> list[int]:
    if instrument == 0:
        return [10 + frame, 10, 36 + frame, 22]
    return [100 - frame, 14, 134 - frame, 26]


@pytest.mark.parametrize("annotated_jobs", [2, 3])
@pytest.mark.timeout(90)
def test_mot_export_preserves_track_ids_across_jobs(
    tmp_path: Path, fxt_login: tuple[Client, str], annotated_jobs: int
) -> None:
    video = tmp_path / "instruments.mkv"
    with av.open(str(video), "w") as container:
        stream = container.add_stream("mjpeg", rate=25)
        stream.width, stream.height = 160, 48
        stream.pix_fmt = "yuvj420p"
        for frame in range(100):
            image = Image.new("RGB", (stream.width, stream.height))
            draw = ImageDraw.Draw(image)
            for instrument, color in enumerate(("red", "blue")):
                draw.rectangle(_box(frame, instrument), fill=color)
            container.mux(stream.encode(av.VideoFrame.from_image(image)))
        container.mux(stream.encode())

    client, _ = fxt_login
    task = client.tasks.create_from_data(
        spec={
            "name": "overlapping tracks",
            "labels": [{"name": "instrument"}],
            "segment_size": 50,
            "overlap": 10,
        },
        resources=[video],
    )
    try:
        label_id = task.get_labels()[0].id
        jobs = sorted(task.get_jobs(), key=lambda job: job.start_frame)
        assert [(job.start_frame, job.stop_frame) for job in jobs] == [(0, 49), (40, 89), (80, 99)]
        for index, job in enumerate(jobs[:annotated_jobs]):
            tracks = []
            for instrument in ((1, 0) if index == 1 else (0, 1)):
                shapes = []
                # The first annotator's last keyframe is at the start of the overlap.
                for frame in (job.start_frame, 40 if index == 0 else job.stop_frame):
                    left, top, right, bottom = _box(frame, instrument)
                    # A second annotator places each box one pixel farther right.
                    offset = int(index == 1)
                    shapes.append(
                        models.TrackedShapeRequest(
                            type="rectangle",
                            frame=frame,
                            points=[left + offset, top, right + offset, bottom],
                        )
                    )
                tracks.append(
                    models.LabeledTrackRequest(
                        frame=job.start_frame, label_id=label_id, shapes=shapes
                    )
                )
            job.set_annotations(models.LabeledDataRequest(tracks=tracks))

        archive = tmp_path / "mot.zip"
        task.export_dataset("MOT 1.1", archive, include_images=False)
        tracks_by_id = defaultdict(dict)
        with ZipFile(archive) as output, output.open("gt/gt.txt") as gt:
            for frame_id, track_id, left, top, width, *_ in csv.reader(io.TextIOWrapper(gt)):
                frame = int(frame_id) - 1
                track = tracks_by_id[int(track_id)]
                assert frame not in track
                track[frame] = (float(left), float(top), float(width))

        assert len(tracks_by_id) == 2
        tracks = sorted(tracks_by_id.values(), key=lambda track: track[0][2])
        for instrument, track in enumerate(tracks):
            assert set(track) == set(range(jobs[annotated_jobs - 1].stop_frame + 1))
            for frame, (left, top, width) in track.items():
                x1, y1, x2, _ = _box(frame, instrument)
                assert left == pytest.approx(x1, abs=1.01)
                assert (top, width) == pytest.approx((y1, x2 - x1))
    finally:
        task.remove()
