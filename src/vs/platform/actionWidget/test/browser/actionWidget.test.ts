/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../base/browser/dom.js';
import { toAction } from '../../../../base/common/actions.js';
import { Emitter } from '../../../../base/common/event.js';
import { AnchorPosition } from '../../../../base/common/layout.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { IContextViewService } from '../../../contextview/browser/contextView.js';
import { ContextViewService } from '../../../contextview/browser/contextViewService.js';
import { IHoverService } from '../../../hover/browser/hover.js';
import { NullHoverService } from '../../../hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { IOpenerService } from '../../../opener/common/opener.js';
import { NullOpenerService } from '../../../opener/test/common/nullOpenerService.js';
import { ActionListItemKind } from '../../browser/actionList.js';
import { ActionWidgetService } from '../../browser/actionWidget.js';

suite('ActionWidgetService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const container = dom.append(document.body, dom.$('div'));
		store.add({ dispose: () => container.remove() });
		const layout = store.add(new Emitter<{ container: HTMLElement; dimension: dom.IDimension }>());
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.set(ILayoutService, new class extends mock<ILayoutService>() {
			override readonly mainContainer = container;
			override readonly activeContainer = container;
			override readonly onDidLayoutContainer = layout.event;
			override getContainer() { return container; }
		}());
		instantiationService.set(IContextKeyService, store.add(new MockContextKeyService()));
		instantiationService.set(IKeybindingService, new MockKeybindingService());
		instantiationService.set(IHoverService, NullHoverService);
		instantiationService.set(IOpenerService, NullOpenerService);
		const contextView = store.add(instantiationService.createInstance(ContextViewService));
		instantiationService.set(IContextViewService, contextView);
		const service = store.add(instantiationService.createInstance(ActionWidgetService));
		return { container, layout, service };
	}

	test('closes an inline permission action once before focusing a warning dialog', () => {
		const { container, service } = setup();
		const trigger = dom.append(container, dom.$('button'));
		const warning = dom.append(container, dom.$('button'));
		const events: string[] = [];
		service.show('permissions', false, [{
			kind: ActionListItemKind.Action,
			label: 'Permissions',
			item: toAction({ id: 'permissions', label: 'Permissions', run: () => { } }),
			section: 'permissions',
			isSectionToggle: true,
		}, {
			kind: ActionListItemKind.Action,
			label: 'Allow All',
			section: 'permissions',
			focusGroup: 'permissions',
			item: toAction({
				id: 'allowAll', label: 'Allow All', checked: true,
				run: () => {
					service.hide();
					events.push('warning');
					warning.focus();
				},
			}),
		}], {
			onSelect: action => action.run(),
			onHide: () => {
				events.push('hide');
				trigger.focus();
			},
		}, { x: 400, y: 400, width: 100, height: 24 }, undefined, [], undefined, {
			anchorPosition: AnchorPosition.ABOVE,
			initialFocusGroup: 'permissions',
		});
		service.acceptSelected();
		assert.deepStrictEqual({
			events,
			warningFocused: document.activeElement === warning,
			visible: service.isVisible,
		}, { events: ['hide', 'warning'], warningFocused: true, visible: false });
	});

	test('keeps inline menus open across workbench layout changes from either initial focus group', () => {
		const { container, layout, service } = setup();
		const states = [];
		for (const initialFocusGroup of [undefined, 'permissions']) {
			let hides = 0;
			service.show('mode', false, [{
				kind: ActionListItemKind.Action,
				label: 'Mode',
				focusGroup: 'mode',
				item: toAction({ id: 'mode', label: 'Mode', checked: true, run: () => { } }),
			}, {
				kind: ActionListItemKind.Action,
				label: 'Manual',
				focusGroup: 'permissions',
				item: toAction({ id: 'manual', label: 'Manual', checked: true, run: () => { } }),
			}], {
				onSelect: () => { },
				onHide: () => { hides++; },
			}, { x: 400, y: 400, width: 100, height: 24 }, undefined, [], undefined, {
				anchorPosition: AnchorPosition.ABOVE,
				initialFocusGroup,
				useFullHeight: true,
			});
			const openAfterInitialLayout = service.isVisible;
			layout.fire({ container, dimension: { width: 900, height: 600 } });
			states.push({ initialFocusGroup, openAfterInitialLayout, visibleAfterResize: service.isVisible, hides });
			service.hide();
		}
		assert.deepStrictEqual(states, [
			{ initialFocusGroup: undefined, openAfterInitialLayout: true, visibleAfterResize: true, hides: 0 },
			{ initialFocusGroup: 'permissions', openAfterInitialLayout: true, visibleAfterResize: true, hides: 0 },
		]);
	});
});
