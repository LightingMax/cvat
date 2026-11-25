// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

context('Test annotations saving works correctly', () => {
    const taskName = 'Test annotations saving works correctly';
    const serverFiles = {
        images: ['image_1.jpg', 'image_2.jpg', 'image_3.jpg'],
    };

    const generalLabel = {
        name: 'test label',
    };

    const skeletonLabel = {
        name: 'skeleton',
        points: [
            { x: 0.55, y: 0.15 },
            { x: 0.20, y: 0.35 },
            { x: 0.43, y: 0.55 },
            { x: 0.63, y: 0.38 },
            { x: 0.27, y: 0.15 },
        ],
    };

    let taskId = null;
    let jobId = null;

    function useShortcut(clientId, shortcut) {
        cy.get('body').click();
        cy.getObjectSidebarItem(clientId).trigger('mouseover');
        cy.getObjectSidebarItem(clientId).should('have.class', 'cvat-objects-sidebar-state-active-item');
        cy.get('body').type(shortcut);
        cy.hideTooltips();
    }

    before(() => {
        cy.visit('/auth/login');
        cy.headlessLogin({ nextURL: '/tasks/create' });
        cy.get('#name').type(taskName);
        cy.addNewLabel({ name: generalLabel.name });
        cy.addNewSkeletonLabel(skeletonLabel);
        cy.selectFilesFromShare(serverFiles);
        cy.intercept('POST', '/api/tasks**').as('createTaskRequest');
        cy.intercept('GET', '/api/jobs**').as('getJobsRequest');
        cy.contains('button', 'Submit & Continue').click();
        cy.wait('@createTaskRequest', { requestTimeout: 25_000 }).then((interception) => {
            expect(interception.response.statusCode).to.equal(201);
            taskId = interception.response.body.id;
        });
        cy.wait('@getJobsRequest', { requestTimeout: 25_000 }).then((interception) => {
            expect(interception.response.statusCode).to.equal(200);
            jobId = interception.response.body.results[0].id;

            cy.visit(`/tasks/${taskId}/jobs/${jobId}`);
            cy.get('.cvat-canvas-container').should('exist').and('be.visible');
        });
    });

    describe('Check object saving works correctly', () => {
        it('Create different objects, save twice. Update, delete. Export hash works as expected', () => {
            // client id 1
            cy.createRectangle({
                points: '2 Points',
                type: 'Shape',
                labelName: generalLabel.name,
                firstX: 150,
                firstY: 350,
                secondX: 200,
                secondY: 400,
            });

            // client id 2
            cy.createRectangle({
                points: '2 Points',
                type: 'Track',
                labelName: generalLabel.name,
                firstX: 200,
                firstY: 400,
                secondX: 250,
                secondY: 450,
            });

            // client id 3
            cy.createEllipse({
                type: 'Shape',
                labelName: generalLabel.name,
                firstX: 150,
                firstY: 350,
                secondX: 200,
                secondY: 400,
            });

            // client id 4
            cy.createEllipse({
                type: 'Track',
                labelName: generalLabel.name,
                firstX: 200,
                firstY: 400,
                secondX: 250,
                secondY: 450,
            });

            // client id 5
            cy.createPolygon({
                reDraw: false,
                type: 'Shape',
                labelName: generalLabel.name,
                pointsMap: [
                    { x: 200, y: 350 },
                    { x: 250, y: 350 },
                    { x: 250, y: 400 },
                    { x: 200, y: 400 },
                ],
                complete: true,
                numberOfPoints: null,
            });

            // client id 6
            cy.createPolygon({
                reDraw: false,
                type: 'Track',
                labelName: generalLabel.name,
                pointsMap: [
                    { x: 150, y: 400 },
                    { x: 200, y: 400 },
                    { x: 200, y: 450 },
                    { x: 150, y: 450 },
                ],
                complete: true,
                numberOfPoints: null,
            });

            // client id 7
            cy.createSkeleton({
                xtl: 150,
                ytl: 350,
                xbr: 200,
                ybr: 400,
                labelName: skeletonLabel.name,
                type: 'Shape',
            });

            // client id 8
            cy.createSkeleton({
                xtl: 200,
                ytl: 400,
                xbr: 250,
                ybr: 450,
                labelName: skeletonLabel.name,
                type: 'Track',
            });

            // client id 9
            cy.createTag(generalLabel.name);

            cy.intercept('PATCH', `/api/jobs/${jobId}/annotations**action=merge**`).as('mergeAnnotations');
            function checkSave(action, count, expectedTags, cleared = false) {
                cy.clickSaveAnnotationView();
                cy.wait('@mergeAnnotations').then(({ request, response }) => {
                    expect(response.statusCode).to.equal(200);
                    const edits = request.body[action];
                    expect(edits.tracks).to.have.length(4);
                    expect(edits.shapes).to.have.length(4);
                    expect(edits.tags).to.have.length(expectedTags);
                    const saved = response.body.annotations;
                    expect(saved.tracks).to.have.length(cleared ? 0 : 4);
                    expect(saved.shapes).to.have.length(cleared ? 0 : 4);
                    expect(saved.tags).to.have.length(cleared ? 0 : 1);
                });
                const saveButton = '.cvat-annotation-header-save-button';
                cy.get(saveButton).should('have.text', 'Save');
                cy.clickSaveAnnotationView();
                cy.get(saveButton).should('have.text', 'Save');
                cy.get('@mergeAnnotations.all').should('have.length', count);
            }

            checkSave('create', 1, 1);
            for (const clientId of [1, 2, 3, 4, 5, 6, 7, 13]) {
                useShortcut(clientId, 'q');
            }

            checkSave('update', 2, 0);

            for (const clientId of [1, 2, 3, 4, 5, 6, 7, 13, 19]) {
                useShortcut(clientId, '{shift}{del}');
                cy.get(`#cvat-objects-sidebar-state-item-${clientId}`).should('not.exist');
            }

            checkSave('delete', 3, 1, true);
        });
    });

    after(() => {
        cy.logout();
        cy.task('getAuthHeaders').then((authHeaders) => {
            cy.request({
                method: 'DELETE',
                url: `/api/tasks/${taskId}`,
                headers: authHeaders,
            });
        });
    });
});
