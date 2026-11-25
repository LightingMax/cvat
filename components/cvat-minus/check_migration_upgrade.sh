#!/bin/bash
# SPDX-License-Identifier: MIT
# Exercise both existing migration histories on a new, isolated PostgreSQL database.
set -euo pipefail
db=minus_ci_migration
./minus exec -T cvat_db createdb -U root "$db"
manage() {
    ./minus exec -T -e "CVAT_POSTGRES_DBNAME=$db" cvat_server python manage.py "$@"
}
sql() {
    ./minus exec -T cvat_db psql -v ON_ERROR_STOP=1 -U root -d "$db" -Atc "$1"
}
manage migrate engine 0111_annotation_merge_submission
receipt_oid=$(sql "SELECT 'engine_annotationmergesubmission'::regclass::oid")
manage migrate engine 0112_merge_minus_calibration
test "$(sql "SELECT 'engine_annotationmergesubmission'::regclass::oid")" = "$receipt_oid"
sql 'SELECT intrinsic_matrix, extrinsic_matrix FROM engine_relatedfile LIMIT 0'
manage migrate engine 0110_rename_task_consensus_replicas_initial_replicas
test "$(sql "SELECT to_regclass('engine_annotationmergesubmission') IS NULL")" = t
manage migrate engine 0111_relatedfile_calibration_matrices
manage migrate engine 0112_merge_minus_calibration
sql 'SELECT digest FROM engine_annotationmergesubmission LIMIT 0'
