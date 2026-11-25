# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("engine", "0110_rename_task_consensus_replicas_initial_replicas")]

    operations = [
        migrations.CreateModel(
            name="AnnotationMergeSubmission",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("user_id", models.PositiveIntegerField()),
                ("submission", models.UUIDField()),
                ("digest", models.CharField(max_length=64)),
                (
                    "job",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="engine.job"),
                ),
            ],
            options={
                "constraints": [
                    models.UniqueConstraint(
                        fields=("job", "user_id", "submission"),
                        name="annotation_merge_submission_unique",
                    ),
                ],
            },
        ),
    ]
