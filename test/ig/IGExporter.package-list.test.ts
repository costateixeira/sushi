import fs, { readJSONSync } from 'fs-extra';
import path from 'path';
import temp from 'temp';
import { cloneDeep } from 'lodash';
import { IGExporter } from '../../src/ig';
import { Package } from '../../src/export';
import { loggerSpy } from '../testhelpers/loggerSpy';
import { minimalConfig } from '../utils/minimalConfig';
import { Configuration } from '../../src/fshtypes';

describe('IGExporter', () => {
  // Track temp files/folders for cleanup
  temp.track();

  describe('#package-list', () => {
    let tempOut: string;
    let config: Configuration;

    beforeEach(() => {
      tempOut = temp.mkdirSync('sushi-test');
      config = cloneDeep(minimalConfig);
      loggerSpy.reset();
    });

    afterEach(() => {
      temp.cleanupSync();
    });

    it('should copy package-list.json when ig-data/package-list.json is defined in legacy configuration', () => {
      const pkg = new Package(config);
      const igDataPath = path.resolve(__dirname, 'fixtures', 'customized-ig', 'ig-data');
      const exporter = new IGExporter(pkg, null, igDataPath);
      exporter.addPackageList(tempOut);
      const expectedContent = readJSONSync(path.join(igDataPath, 'package-list.json'));
      const pkgListPath = path.join(tempOut, 'package-list.json');
      expect(fs.existsSync(pkgListPath)).toBeTruthy();
      const content = fs.readJSONSync(pkgListPath);
      expect(content).toEqual(expectedContent);
      const outputLogDetails = exporter.getOutputLogDetails(pkgListPath);
      expect(outputLogDetails.action).toBe('copied');
      expect(outputLogDetails.inputs).toHaveLength(1);
      expect(outputLogDetails.inputs[0].endsWith('package-list.json')).toBeTruthy();
      expect(loggerSpy.getLastMessage('info')).toBe(`Copied ig-data${path.sep}package-list.json.`);
    });

    it('should not copy package-list.json even if ig-data/package-list.json is defined', () => {
      const pkg = new Package(config);
      const igDataPath = path.resolve(__dirname, 'fixtures', 'customized-ig', 'ig-data');
      const exporter = new IGExporter(pkg, null, igDataPath, true); // New tank configuration input/fsh/
      exporter.addPackageList(tempOut);
      const pkgListPath = path.join(tempOut, 'package-list.json');
      expect(fs.existsSync(pkgListPath)).toBeFalsy(); // Do not copy user provided file or generate a new file
      expect(exporter.getOutputLogDetails(pkgListPath)).toBeUndefined();
      expect(loggerSpy.getAllMessages('info')).toHaveLength(0);
    });
  });
});
