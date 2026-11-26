// Copyright (C) CVAT Minus contributors
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

context('Interface language and appearance', () => {
    function choose(option) {
        cy.get('.cvat-appearance-menu').click();
        cy.contains('.ant-dropdown-menu-item', option).click();
    }

    beforeEach(() => {
        cy.clearCookies();
        cy.visit('/auth/login', {
            onBeforeLoad(win) {
                win.localStorage.setItem('cvat-ui-language', 'en');
                win.localStorage.setItem('cvat-ui-theme', 'light');
            },
        });
    });

    afterEach(() => {
        cy.window().then((win) => {
            win.localStorage.removeItem('cvat-ui-theme');
            win.localStorage.removeItem('cvat-ui-language');
        });
    });

    it('retains the selected language across login and reload', () => {
        choose('简体中文');
        cy.get('html').should('have.attr', 'lang', 'zh-CN');
        cy.get('.cvat-appearance-menu').should('have.attr', 'aria-label', '语言与外观');
        cy.headlessLogin({ nextURL: '/tasks' });
        cy.get('.cvat-header-projects-button').should('contain.text', '项目');
        cy.reload();
        cy.get('.cvat-header-tasks-button').should('contain.text', '任务');
        choose('English');
        cy.get('html').should('have.attr', 'lang', 'en');
        cy.get('.cvat-header-tasks-button').should('contain.text', 'Tasks');
    });

    it('changes the theme in place and remembers the selection', () => {
        cy.window().as('originalWindow');
        choose('Dark');
        cy.get('html').should('have.attr', 'data-cvat-theme', 'dark');
        cy.get('@originalWindow').then((original) => cy.window().should('equal', original));
        cy.reload();
        cy.get('html').should('have.attr', 'data-cvat-theme', 'dark');
        choose('Light');
        cy.get('html').should('have.attr', 'data-cvat-theme', 'light');
        choose('Use system theme');
        cy.window().then((win) => {
            const expected = win.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            cy.get('html').should('have.attr', 'data-cvat-theme', expected);
        });
    });
});
