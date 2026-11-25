# SPDX-License-Identifier: MIT

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("engine", "0111_annotation_merge_submission"),
        ("engine", "0111_relatedfile_calibration_matrices"),
    ]

    operations = []
