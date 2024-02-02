import { render, unmountComponentAtNode } from 'react-dom';
import App from './components/App/App';
import { configureStore } from './configureStore';
import { LabelStudio as LabelStudioReact } from './Component';
import { registerPanels } from './registerPanels';
import { configure } from 'mobx';
import { EventInvoker } from './utils/events';
import legacyEvents from './core/External';
import { toCamelCase } from 'strman';
import { isDefined } from './utils/utilities';
import { Hotkey } from './core/Hotkey';
import defaultOptions from './defaultOptions';
import { destroy } from 'mobx-state-tree';
import { destroy as destroySharedStore } from './mixins/SharedChoiceStore/mixin';
import { cleanDomAfterReact, findReactKey } from './utils/reactCleaner';
import { FF_LSDV_4620_3_ML, isFF } from './utils/feature-flags';

configure({
  isolateGlobalState: true,
});

export class LabelStudio {
  static instances = new Set();

  static destroyAll() {
    this.instances.forEach(inst => inst.destroy?.());
    this.instances.clear();
  }

  constructor(root, userOptions = {}) {
    const options = Object.assign({}, defaultOptions, userOptions ?? {});

    if (options.keymap) {
      Hotkey.setKeymap(options.keymap);
    }

    this.root = root;
    this.events = new EventInvoker();
    this.options = options ?? {};
    this.destroy = () => {
      /* noop */
    };

    this.supportLgacyEvents(options);
    this.createApp();

    this.constructor.instances.add(this);
  }

  on(...args) {
    this.events.on(...args);
  }

  off(eventName, callback) {
    if (isDefined(callback)) {
      this.events.off(eventName, callback);
    } else {
      this.events.removeAll(eventName);
    }
  }

  async createApp() {
    const options = {
      interfaces: [
        'panel',
        'update',
        'submit',
        'skip',
        'controls',
        'infobar',
        'topbar',
        'instruction',
        'annotations:history',
        'annotations:tabs',
        'annotations:menu',
        'annotations:current',
        'predictions:tabs',
        'predictions:menu',
        'edit-history',
      ],
      task: {
        annotations: [
          {
            annotated_at: null,
            annotation_notes: null,
            annotation_source: 0,
            annotation_status: 'unlabeled',
            annotation_type: 1,
            completed_by: 1,
            created_at: '2024-02-02T10:36:24.206546Z',
            id: 2,
            lead_time: 0,
            parent_annotation: null,
            result: [],
            review_notes: null,
            supercheck_notes: null,
            task: 7,
            updated_at: '2024-02-02T10:36:24.206560Z',
          },
        ],
        data: {
          context: 'The statement you provided is a general medical context',
          input_language: 'English',
          input_text:
            'Abdominal pain, also known as a stomach ache, is a symptom associated with both non-serious and serious medical issues.',
          machine_translation:
            'पेट दर्द, जिसे पेट दर्द के रूप में भी जाना जाता है, गैर-गंभीर और गंभीर चिकित्सा समस्याओं दोनों से जुड़ा एक लक्षण है।',
          output_language: 'Hindi',
          word_count: 17,
        },
        id: 7,
        predictions: [],
      },
      user: {
        firstName: '',
        lastName: '',
        id: 1,
      },
    };

    console.log('this.options, this.events => ', this.options, options);
    const { store, getRoot } = await configureStore(options, this.events);
    const rootElement = getRoot(this.root);

    this.store = store;
    window.Htx = this.store;

    const isRendered = false;

    const renderApp = () => {
      console.log('rendered!!');
      if (isRendered) {
        clearRenderedApp();
      }
      render(<App store={this.store} panels={registerPanels(this.options.panels) ?? []} />, rootElement);
    };

    const clearRenderedApp = () => {
      if (!rootElement.childNodes?.length) return;

      const childNodes = [...rootElement.childNodes];
      // cleanDomAfterReact needs this key to be sure that cleaning affects only current react subtree
      const reactKey = findReactKey(childNodes[0]);

      unmountComponentAtNode(rootElement);
      /*
        Unmounting doesn't help with clearing React's fibers
        but removing the manually helps
        @see https://github.com/facebook/react/pull/20290 (similar problem)
        That's maybe not relevant in version 18
       */
      cleanDomAfterReact(childNodes, reactKey);
      cleanDomAfterReact([rootElement], reactKey);
    };

    renderApp();
    store.setAppControls({
      isRendered() {
        return isRendered;
      },
      render: renderApp,
      clear: clearRenderedApp,
    });

    this.destroy = () => {
      if (isFF(FF_LSDV_4620_3_ML)) {
        clearRenderedApp();
      }
      destroySharedStore();
      if (isFF(FF_LSDV_4620_3_ML)) {
        /*
           It seems that destroying children separately helps GC to collect garbage
           ...
         */
        this.store.selfDestroy();
      }
      destroy(this.store);
      if (isFF(FF_LSDV_4620_3_ML)) {
        /*
            ...
            as well as nulling all these this.store
         */
        this.store = null;
        this.destroy = null;
        this.constructor.instances.delete(this);
      }
    };
  }

  supportLgacyEvents() {
    const keys = Object.keys(legacyEvents);

    keys.forEach(key => {
      const callback = this.options[key];

      if (isDefined(callback)) {
        const eventName = toCamelCase(key.replace(/^on/, ''));

        this.events.on(eventName, callback);
      }
    });
  }
}

LabelStudio.Component = LabelStudioReact;
