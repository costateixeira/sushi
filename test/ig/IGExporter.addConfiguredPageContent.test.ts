import fs from 'fs-extra';
import path from 'path';
import temp from 'temp';
import { cloneDeep } from 'lodash';
import { IGExporter } from '../../src/ig';
import { Package } from '../../src/export';
import { loggerSpy } from '../testhelpers/loggerSpy';
import { FHIRDefinitions } from '../../src/fhirdefs';
import { Configuration } from '../../src/fshtypes';
import { minimalConfig } from '../utils/minimalConfig';

describe('IGExporter', () => {
  // Track temp files/folders for cleanup
  temp.track();

  describe('#configured-pagecontent', () => {
    let tempOut: string;
    let config: Configuration;
    const outputFileSyncSpy = jest.spyOn(fs, 'outputFileSync');
    const defs = new FHIRDefinitions();

    beforeEach(() => {
      tempOut = temp.mkdirSync('sushi-test');
      config = cloneDeep(minimalConfig);
      config.pages = [
        { nameUrl: 'index.md', title: 'Example Home' },
        {
          nameUrl: 'examples.xml',
          title: 'Examples Overview',
          page: [{ nameUrl: 'simpleExamples.xml' }]
        },
        { nameUrl: 'generated.md', title: 'A generated page that does not exist yet' }
      ];
      loggerSpy.reset();
    });

    afterEach(() => {
      temp.cleanupSync();
    });

    it('should not copy configured page content files', () => {
      const pkg = new Package(config);
      const igDataPath = path.resolve(
        __dirname,
        'fixtures',
        'customized-ig-with-pagecontent',
        'ig-data'
      );
      const exporter = new IGExporter(pkg, defs, igDataPath, true); // Current tank configuration
      exporter.initIG();
      exporter.addConfiguredPageContent(tempOut);
      const pageContentPath = path.join(tempOut, 'input', 'pagecontent');
      expect(fs.existsSync(pageContentPath)).toBeFalsy();
      expect(outputFileSyncSpy).not.toHaveBeenCalled();
      expect(loggerSpy.getAllMessages()).toHaveLength(0); // No error logged for specifying generated.md, which doesn't exist yet
    });

    it('should copy over configured page content in legacy IG publisher configuration', () => {
      const pkg = new Package(config);
      const igDataPath = path.resolve(
        __dirname,
        'fixtures',
        'customized-ig-with-pagecontent',
        'ig-data'
      );
      const exporter = new IGExporter(pkg, defs, igDataPath); // Legacy tank configuration
      exporter.initIG();
      exporter.addConfiguredPageContent(tempOut);
      const pageContentPath = path.join(tempOut, 'input', 'pagecontent');
      expect(fs.existsSync(pageContentPath)).toBeTruthy();
      expect(outputFileSyncSpy).toHaveBeenCalledTimes(3);
      const files = fs.readdirSync(pageContentPath, 'utf8');
      const expectedPages = ['examples.xml', 'index.md', 'simpleExamples.xml'];
      expect(files).toEqual(expectedPages); // Copies over all pagecontent files
      for (const file of expectedPages) {
        const content = fs.readFileSync(path.join(pageContentPath, file), 'utf8');
        expect(content).toMatch(/^\*\s+WARNING: DO NOT EDIT THIS FILE\s+\*$/m);
      }
      expect(loggerSpy.getAllMessages()).toHaveLength(0); // No error logged for specifying generated.md, which doesn't exist yet
    });
  });
});
