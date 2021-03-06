/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject, named } from 'inversify';
import { ProcessManager } from './process-manager';
import { ILogger } from '@theia/core/lib/common';
import { Process, ProcessType, ProcessOptions } from './process';
import { ChildProcess, spawn } from 'child_process';
import * as stream from 'stream';

export const RawProcessOptions = Symbol("RawProcessOptions");
export interface RawProcessOptions extends ProcessOptions {
}

export const RawProcessFactory = Symbol("RawProcessFactory");
export interface RawProcessFactory {
    (options: RawProcessOptions): RawProcess;
}

/* A Node stream like /dev/null.

   Writing goes to a black hole, reading returns EOF.  */
class DevNullStream extends stream.Duplex {
    // tslint:disable-next-line:no-any
    _write(chunk: any, encoding: string, callback: (err?: Error) => void): void {
        callback();
    }

    _read(size: number): void {
        // tslint:disable-next-line:no-null-keyword
        this.push(null);
    }
}

@injectable()
export class RawProcess extends Process {

    readonly input: stream.Writable;
    readonly output: stream.Readable;
    readonly errorOutput: stream.Readable;
    readonly process: ChildProcess;

    constructor(
        @inject(RawProcessOptions) options: RawProcessOptions,
        @inject(ProcessManager) processManager: ProcessManager,
        @inject(ILogger) @named('process') logger: ILogger) {
        super(processManager, logger, ProcessType.Raw, options);

        this.logger.debug(`Starting raw process: ${options.command},`
            + ` with args: ${options.args ? options.args.join(' ') : ''}, `
            + ` with options: ${JSON.stringify(options.options)}`);

        /* spawn can throw exceptions, for example if the file is not
           executable, it throws an error with EACCES.  Here, we try to
           normalize the error handling by calling the error handler
           instead.  */
        try {
            this.process = spawn(
                options.command,
                options.args,
                options.options);

            this.process.on('error', this.emitOnError.bind(this));
            this.process.on('exit', this.emitOnExit.bind(this));

            this.output = this.process.stdout;
            this.input = this.process.stdin;
            this.errorOutput = this.process.stderr;
        } catch (error) {
            /* When an error is thrown, set up some fake streams, so the client
               code doesn't break because these field are undefined.  */
            this.output = new DevNullStream();
            this.input = new DevNullStream();
            this.errorOutput = new DevNullStream();

            /* Call the client error handler, but first give them a chance to register it.  */
            process.nextTick(() => {
                this.errorEmitter.fire(error);
            });
        }
    }

    get pid() {
        return this.process.pid;
    }

    kill(signal?: string) {
        if (this.killed === false) {
            this.process.kill(signal);
        }
    }

}
