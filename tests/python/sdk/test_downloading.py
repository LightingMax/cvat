# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

import gzip
import io
import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest
from cvat_sdk import Client
from cvat_sdk.core.downloading import Downloader
from cvat_sdk.core.helpers import DeferredTqdmProgressReporter
from urllib3 import HTTPResponse


@pytest.mark.parametrize("encoding", [None, "gzip"])
def test_download_preserves_zip_contents(tmp_path: Path, encoding: str | None) -> None:
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as output:
        output.writestr("annotations.txt", b"track\n" * 1000)
    expected = archive.getvalue()
    body = gzip.compress(expected) if encoding else expected
    headers = {"Content-Length": str(len(body))}
    if encoding:
        headers["Content-Encoding"] = encoding
    response = HTTPResponse(body=io.BytesIO(body), headers=headers, preload_content=False)
    progress_output = io.StringIO()
    progress = DeferredTqdmProgressReporter({"file": progress_output, "bar_format": "{n}/{total}"})

    with (
        Client("http://localhost", check_server_version=False) as client,
        patch.object(client.api_client.rest_client, "GET", return_value=response),
    ):
        path = Downloader(client).download_file(
            "http://localhost/export", tmp_path / "export.zip", pbar=progress
        )

    assert path.read_bytes() == expected
    assert progress_output.getvalue().strip().endswith(f"{len(body)}/{len(body)}")
