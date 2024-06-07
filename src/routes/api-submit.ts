import {Router} from 'express';
import {ErrorCodes, Roles, AUTHENTICATED_ROLES, UserInfo, API_SUBMISSION} from '../inc/constants.js';
import db from '../inc/database.js';
import { evaluateSubmission } from '../inc/execution.js';

import {apiRoute, bindApiWithRoute, apiValidatorParam, ApiRequest} from '../inc/api.js';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

const router = Router();
export default router;


function getFileByUUID(directory: string, uuid: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        fs.readdir(directory, (err, files) => {
            if (err) {
                reject(err);
                return;
            }

            const matchingFile = files.find(file => {
                const [fileUUID, ext] = file.split('.');
                return fileUUID === uuid;
            });

            if (!matchingFile) {
                reject(new Error(`File with UUID ${uuid} not found in directory ${directory}`));
                return;
            }

            const filePath = path.join(directory, matchingFile);
            resolve(filePath);
        });
    });
}


bindApiWithRoute(API_SUBMISSION.SUBMISSION__CREATE, api => apiRoute(
	router, 
	api,
	
	apiValidatorParam(api, 'exam_cont_id').trim().notEmpty().isInt().toInt(),
	apiValidatorParam(api, 'description').trim().optional(),
	apiValidatorParam(api, 'user_class_id').notEmpty().isInt().toInt(),
	
	async (req: ApiRequest) => {
		//#region Nhận bài làm từ phía sinh viên gửi lên
		const userInfo = await req.ctx.getUser()?.getInfo() as UserInfo;

		if (!AUTHENTICATED_ROLES.includes(userInfo.role))
			return req.api.sendError(ErrorCodes.INVALID_PARAMETERS);


		if (!req.files?.data_file)
			return req.api.sendError(ErrorCodes.INVALID_PARAMETERS, 'Chưa gửi file bài làm');
		
		const originalFileExt = path.extname(req.files.data_file.name).toLowerCase();
		const fileNameWithoutExt = path.parse(req.files.data_file.name).name

		if (!['.c', '.cpp'].includes(originalFileExt))
			return req.api.sendError(ErrorCodes.INVALID_UPLOAD_FILE_TYPE, 'Hệ thống chỉ nhận file mã nguồn C hoặc C++');

		const BINARY_DATA = req.files.data_file.data
		//#endregion
		
		//#region Lưu thông tin ban đầu của bài làm vào CSDL
		const NEW_SUBMISSION_UUID = randomUUID()

		try {
			await db.insert('submission', {
				uuid: NEW_SUBMISSION_UUID,
				student_id: req.api.params.user_class_id,
				date_time: new Date().toISOString().slice(0, 19).replace('T', ' '),
				// exercise_id: req.api.params.exercise_id,
				question_id: req.api.params.exam_cont_id,
				description: req.api.params.description || null,
				name: fileNameWithoutExt
			})

			console.info('Ghi nhận bài làm mới với UUID:', NEW_SUBMISSION_UUID)
		} catch (e) {
			return req.api.sendError(ErrorCodes.INTERNAL_ERROR);
		}

	   	req.ctx.logActivity('New submission', { submission_id: NEW_SUBMISSION_UUID });
	   	//#endregion

		//#region Lưu bài làm vào kho bài gửi lên
		const SUBMIT_PATH = process.env['SUBMISSION_PATH']
		const FILE_PATH = SUBMIT_PATH + '\\' + NEW_SUBMISSION_UUID + originalFileExt
		fs.writeFileSync(FILE_PATH, BINARY_DATA);
		//#endregion

		req.api.sendSuccess({ submission_id: NEW_SUBMISSION_UUID });
		
		//#region Tiến hành chấm bài (trên một luồng riêng)
		evaluateSubmission({ uuid: NEW_SUBMISSION_UUID, path: FILE_PATH })
		//#endregion
	}
))

bindApiWithRoute(API_SUBMISSION.SUBMISSION__GET, api => apiRoute(
	router,
	api,

	apiValidatorParam(api, 'submission_id').notEmpty().isString(),

	async (req: ApiRequest) => {
		const userInfo = await req.ctx.getUser()?.getInfo() as UserInfo;
		// const r = await db.query("SELECT course.user_id FROM exercise INNER JOIN course ON exercise.course_id = course.id WHERE exercise.id = ?",[req.api.params.class_id])
		// const result = r[0]['user_id'];
		
		if (!AUTHENTICATED_ROLES.includes(userInfo.role))
			return req.api.sendError(ErrorCodes.NO_PERMISSION);

		const res = db.query("SELECT * FROM submission WHERE uuid = ?", [req.api.params.submission_id])
		req.api.sendSuccess(res[0])
	}
))

bindApiWithRoute(API_SUBMISSION.SUBMISSION__GET_FILE, api => apiRoute(
	router,
	api,

	apiValidatorParam(api, 'submission_id').notEmpty().isString(),

	async (req: ApiRequest) => {
		const userInfo = await req.ctx.getUser()?.getInfo() as UserInfo;
		// const r = await db.query("SELECT course.user_id FROM exercise INNER JOIN course ON exercise.course_id = course.id WHERE exercise.id = ?",[req.api.params.class_id])
		// const result = r[0]['user_id'];
		
		if (!AUTHENTICATED_ROLES.includes(userInfo.role))
			return req.api.sendError(ErrorCodes.NO_PERMISSION);

		const SUB_ID = req.api.params.submission_id
		const SUBMIT_PATH = process.env['SUBMISSION_PATH']

		if (!SUBMIT_PATH) {
			return req.api.sendError(ErrorCodes.INTERNAL_ERROR, "Duong dan luu bai nop chua duoc chi dinh!")
		}

		getFileByUUID(SUBMIT_PATH, SUB_ID)
			.then(filePath => {
				fs.readFile(filePath, (err, data) => {
					if (err) {
						return req.api.sendError(ErrorCodes.INTERNAL_ERROR, "Khong the doc file voi UUID " + SUB_ID)
					}
					
					const filename = path.basename(filePath);
					
					req.api.res.setHeader('Content-Type', 'text/plain')
					req.api.res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
					req.api.res.write(data)
					req.api.res.end()
				})				
			})
			.catch(err => {
				console.error('Error:', err);
			});
	}
))

bindApiWithRoute(API_SUBMISSION.SUBMISSION__LIST, api => apiRoute( router, api,
	apiValidatorParam(api, 'question_id').notEmpty().isInt().toInt(),

	async (req: ApiRequest) => {
		const userInfo = await req.ctx.getUser()?.getInfo() as UserInfo;
		const r= await db.query("SELECT  FROM submission INNER JOIN course ON exercise.course_id = course.id WHERE exercise.id = ?",[req.api.params.class_id])
		const result = r[0]['user_id'];
		
		if (!AUTHENTICATED_ROLES.includes(userInfo.role))
			return req.api.sendError(ErrorCodes.INVALID_PARAMETERS);

		if (result!== userInfo.role || ![Roles.SYSTEM_ADMIN].includes(userInfo.role))
			return req.api.sendError(ErrorCodes.NO_PERMISSION);
		else await db.query("DELETE FROM exercise WHERE id = ?", [req.api.params.exercise_id]);
		
		req.api.sendSuccess();
	}
))
