// Copyright (C) 2021-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

import { taskName, labelName } from '../../support/const';

context('Explicit annotation saves', () => {
    before(() => {
        cy.prepareUserSession();
        cy.openTaskJob(taskName);
    });

    it('Keeps edits local until Save and persists them on reload', () => {
        cy.location('pathname').then((path) => {
            const jobId = path.split('/').pop();
            const annotations = `/api/jobs/${jobId}/annotations`;
            cy.request(annotations).its('body.shapes').then((initial) => {
                cy.createRectangle({
                    points: '2 Points',
                    type: 'Shape',
                    labelName,
                    firstX: 100,
                    firstY: 100,
                    secondX: 200,
                    secondY: 200,
                });
                cy.request(annotations).its('body.shapes').should('deep.equal', initial);
                cy.saveJob();
                cy.reload();
                cy.get('.cvat-canvas-container .cvat_canvas_shape').should('be.visible');
                cy.request(annotations).its('body.shapes').should('have.length', initial.length + 1);
            });
        });
    });
});
